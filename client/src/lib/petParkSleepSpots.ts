/** Rest interactions use saved park-world coordinates, not the device viewport. */
export interface ParkSleepArea {
  kind: "decor" | "sleep_spot" | "effect" | "terrain";
  effectType?: string | null;
  xPct: number;
  yPct: number;
  size: number;
}

/** Return the authored spot footprint rather than inventing a second pet-size setting.
 * When spots overlap the closest spot wins; render size never exceeds the normal pet.
 */
export function parkSleepSpotAtPosition(
  position: { x: number; y: number },
  items: readonly ParkSleepArea[],
  world: { width: number; height: number },
): ParkSleepArea | null {
  if (!(world.width > 0 && world.height > 0)) return null;
  let closest: ParkSleepArea | null = null;
  let distance = Infinity;
  for (const item of items) {
    if (item.kind !== "sleep_spot" && !(item.kind === "effect" && item.effectType === "sleep")) continue;
    if (!Number.isFinite(item.size) || item.size <= 0) continue;
    const dx = (position.x - item.xPct) * world.width;
    const dy = (position.y - item.yPct) * world.height;
    const half = item.size / 2;
    if (Math.abs(dx) > half || Math.abs(dy) > half) continue;
    const nextDistance = dx * dx + dy * dy;
    if (nextDistance < distance) {
      closest = item;
      distance = nextDistance;
    }
  }
  return closest;
}

export function parkPetSizeOnSleepSpot(
  position: { x: number; y: number },
  items: readonly ParkSleepArea[],
  world: { width: number; height: number },
  normalSize = 200,
): number {
  const spot = parkSleepSpotAtPosition(position, items, world);
  return spot ? Math.min(normalSize, spot.size) : normalSize;
}

export function isParkSleepPosition(
  position: { x: number; y: number },
  items: readonly ParkSleepArea[],
  world: { width: number; height: number },
): boolean {
  return parkSleepSpotAtPosition(position, items, world) !== null;
}

/** Modest indoor-only presentation shrink (less than the 20% outdoor reduction).
 * Apply AFTER sleep-spot sizing to scale resting and ordinary room pets alike.
 * The same function must be used by scene rendering and drag collision bounds.
 */
export const PARK_INDOOR_SCENE_PET_RATIO = 0.9;
export function parkIndoorScenePetSize(size: number): number {
  return size * PARK_INDOOR_SCENE_PET_RATIO;
}

/** Interior sleep squares are authored as a percentage of the room height.
 * Use the visible artwork's dimensions, not the phone viewport, for both
 * interaction and pet size. All other indoor pets retain the 225-unit base.
 */
/** Use the same room-image footprint for the sleep pose and size reduction. */
export function parkIndoorSleepSpotAtPosition(
  position: { x: number; y: number },
  effects: readonly { type: string; x: number; y: number; size: number }[],
  artwork: { width: number; height: number },
): number | null {
  if (!(artwork.width > 0 && artwork.height > 0)) return null;
  let nearest = Infinity;
  let spotSize: number | null = null;
  for (const effect of effects) {
    if (effect.type !== "sleep" || !Number.isFinite(effect.size) || effect.size <= 0) continue;
    const area = artwork.height * effect.size / 100;
    const dx = (position.x - effect.x) * artwork.width;
    const dy = (position.y - effect.y) * artwork.height;
    if (Math.abs(dx) > area / 2 || Math.abs(dy) > area / 2) continue;
    const distance = dx * dx + dy * dy;
    if (distance < nearest) {
      nearest = distance;
      spotSize = area;
    }
  }
  return spotSize;
}

export function isParkIndoorSleepPosition(
  position: { x: number; y: number },
  effects: readonly { type: string; x: number; y: number; size: number }[],
  artwork: { width: number; height: number },
): boolean {
  return parkIndoorSleepSpotAtPosition(position, effects, artwork) !== null;
}

export function parkIndoorPetSizeOnSleepSpot(
  position: { x: number; y: number },
  effects: readonly { type: string; x: number; y: number; size: number }[],
  artwork: { width: number; height: number },
  normalSize = 225,
): number {
  const spotSize = parkIndoorSleepSpotAtPosition(position, effects, artwork);
  return spotSize === null ? normalSize : Math.min(normalSize, spotSize);
}
