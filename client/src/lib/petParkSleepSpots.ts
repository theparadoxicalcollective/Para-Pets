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
