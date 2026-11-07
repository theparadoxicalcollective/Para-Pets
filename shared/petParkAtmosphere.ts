import { isHouseInteriorLightEffectType, type HouseInteriorEffect } from "./housing";
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

export function parkOutdoorLightEffects(
  items: readonly ParkAtmosphereObject[],
  geometry: { width: number; height: number; scale: number },
  camera: { x: number; y: number },
  viewport: { width: number; height: number },
): HouseInteriorEffect[] {
  if (geometry.width <= 0 || geometry.height <= 0) return [];
  const result: HouseInteriorEffect[] = [];
  const inView = (x: number, y: number) => {
    const px = camera.x + x * geometry.width;
    const py = camera.y + y * geometry.height;
    return px >= -160 && py >= -160 &&
      px <= viewport.width + 160 && py <= viewport.height + 160;
  };
  for (const item of items) {
    if (item.kind === "effect" && isHouseInteriorLightEffectType(item.effectType)) {
      if (inView(item.xPct, item.yPct)) {
        result.push({ id: item.id, type: item.effectType,
          x: item.xPct, y: item.yPct, size: item.size * geometry.scale / geometry.height * 100 });
      }
    }
    if (item.kind !== "decor") continue;
    for (const effect of item.decorEffects ?? []) {
      if (!isHouseInteriorLightEffectType(effect.type)) continue;
      const position = parkDecorEffectWorldPosition(item, effect, geometry);
      if (!inView(position.x, position.y)) continue;
      result.push({ id: `${item.id}-${effect.id}`, type: effect.type,
        x: position.x, y: position.y, size: position.size });
    }
  }
  return result;
}
