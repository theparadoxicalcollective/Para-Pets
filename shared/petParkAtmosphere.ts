import { getHouseInteriorLightRadiusRatio, isHouseInteriorEffectType, isHouseInteriorLightEffectType, type HouseInteriorEffect } from "./housing";
import { parkDecorEffectWorldPosition, type ParkDecorEffect } from "./petParkDecorEffects";

export type ParkAtmosphereObject = {
  id: string;
  kind: string;
  xPct: number;
  yPct: number;
  size: number;
  flipped: boolean;
  effectType?: string | null;
  decorEffects?: readonly ParkDecorEffect[];
};

/**
 * An outdoor lamp's tiny visible flare and the area it lights are different.
 * Keep visible artwork size untouched; only expand the darkness-mask reach.
 * Both scene editors use this same radius and the same world-to-screen math.
 * Home/indoor renderers pass sceneLamp=false and keep their original radius.
 */
export function parkOutdoorLightRadius(
  effect: HouseInteriorEffect,
  sceneHeight: number,
  sceneLamp = false,
): number {
  const height = Number.isFinite(sceneHeight) && sceneHeight > 0 ? sceneHeight : 1;
  // The lamp orb and its illumination reach are independent. Use the
  // saved lamp size as the *only* scalable input: as the orb gets smaller,
  // its illumination pool shrinks too, with no large fixed baseline radius.
  // 4.4× reveals nearby scenery with a soft edge; it does not resize the orb.
  // The campfire and interior light calculations below remain untouched.
  if (sceneLamp && effect.type === "lamp_light") {
    const orbDiameter = Math.max(0, effect.size / 100 * height);
    return Math.max(8, Math.min(height * 0.32, orbDiameter * 4.4));
  }
  const spread = sceneLamp && effect.type === "candle_light" ? 2.35 : 1;
  return Math.max(12, Math.min(height * 0.68,
    getHouseInteriorLightRadiusRatio(effect) * height * spread));
}

export function parkOutdoorLightEffects(
  items: readonly ParkAtmosphereObject[],
  geometry: { width: number; height: number; scale: number },
  camera: { x: number; y: number },
  viewport: { width: number; height: number },
): HouseInteriorEffect[] {
  if (geometry.width <= 0 || geometry.height <= 0) return [];
  const result: HouseInteriorEffect[] = [];
  const inView = (light: HouseInteriorEffect) => {
    const px = camera.x + light.x * geometry.width;
    const py = camera.y + light.y * geometry.height;
    // Large, softly fading lamps must not pop into view only when their
    // small visible center crosses the old fixed 160px culling margin.
    const margin = Math.max(160, parkOutdoorLightRadius(light, geometry.height, true));
    return px >= -margin && py >= -margin &&
      px <= viewport.width + margin && py <= viewport.height + margin;
  };
  for (const item of items) {
    if (item.kind === "effect" &&
        (item.effectType === "colored_light" ||
          (isHouseInteriorEffectType(item.effectType) && isHouseInteriorLightEffectType(item.effectType)))) {
      const light = { id: item.id,
        type: item.effectType === "colored_light" ? "lamp_light" as const : item.effectType,
        x: item.xPct, y: item.yPct, size: item.size * geometry.scale / geometry.height * 100 };
      if (inView(light)) result.push(light);
    }
    // Outdoor lamps may be attached to building facades or decorations.
    if (item.kind !== "decor" && item.kind !== "building") continue;
    for (const effect of item.decorEffects ?? []) {
      if (effect.type !== "colored_light" && (!isHouseInteriorEffectType(effect.type) || !isHouseInteriorLightEffectType(effect.type))) continue;
      const position = parkDecorEffectWorldPosition(item, effect, geometry);
      const light = { id: `${item.id}-${effect.id}`, type: effect.type === "colored_light" ? "lamp_light" as const : effect.type,
        x: position.x, y: position.y, size: position.size };
      if (inView(light)) result.push(light);
    }
  }
  return result;
}

/** A firefly swarm uses scene-relative positions and a square visual footprint.
 * Its nine moving particles share the same anchors in the visible SVG and
 * in the existing darkness mask (no second lighting overlay).
 */
export type ParkFireflyField = { id: string; x: number; y: number; size: number };
export const PARK_MAX_VISIBLE_FIREFLY_FIELDS = 8;

export function parkOutdoorFireflyFields(
  items: readonly ParkAtmosphereObject[],
  geometry: { width: number; height: number; scale: number },
  camera: { x: number; y: number },
  viewport: { width: number; height: number },
): ParkFireflyField[] {
  if (geometry.width <= 0 || geometry.height <= 0) return [];
  const fields: ParkFireflyField[] = [];
  const add = (field: ParkFireflyField) => {
    const x = camera.x + field.x * geometry.width;
    const y = camera.y + field.y * geometry.height;
    const spread = Math.max(40, field.size / 100 * geometry.height);
    if (x < -spread || y < -spread ||
        x > viewport.width + spread || y > viewport.height + spread) return;
    fields.push(field);
  };
  for (const item of items) {
    if (item.kind === "effect" && item.effectType === "fireflies") {
      add({ id: item.id, x: item.xPct, y: item.yPct,
        size: item.size * geometry.scale / geometry.height * 100 });
    }
    if (item.kind !== "decor" && item.kind !== "building") continue;
    for (const effect of item.decorEffects ?? []) {
      if (effect.type !== "fireflies") continue;
      add({ id: `${item.id}-${effect.id}`,
        ...parkDecorEffectWorldPosition(item, effect, geometry) });
    }
  }
  // Limit animated masks on iOS while keeping every authored placement stored.
  return fields.slice(0, PARK_MAX_VISIBLE_FIREFLY_FIELDS);
}
