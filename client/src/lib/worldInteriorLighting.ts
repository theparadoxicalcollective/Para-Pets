import { isHouseInteriorEffectType, type HouseInteriorEffect } from "@shared/housing";
import type { WorldSceneInteriorItem } from "@shared/worlds/worldSceneContent";

/** World artwork uses a width-based size; Pet Park's room light mask uses
 * percentages of room height. Convert once for both authoring and playback. */
export function worldInteriorLights(items: WorldSceneInteriorItem[], width: number, height: number): HouseInteriorEffect[] {
  return items.filter(item => item.kind === "effect" &&
    (isHouseInteriorEffectType(item.effectType) || item.effectType === "colored_light"))
    .map(item => ({
      id: item.id,
      type: (item.effectType === "colored_light" ? "lamp_light" : item.effectType) as HouseInteriorEffect["type"],
      x: item.xPct, y: item.yPct, size: item.size * width / Math.max(1, height) / 8.5,
    }));
}
