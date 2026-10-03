import {
  getHomeAttachedEffectSize,
  type HomeCatalogEffect,
  type HomeSceneItemType,
  type HouseInteriorEffect,
} from "@shared/housing";

export interface HomeEffectPlacement {
  id: string;
  xPct: number;
  yPct: number;
  size: number;
  effectEnabled?: boolean;
  item: {
    type: HomeSceneItemType;
    homeEffect?: HomeCatalogEffect | null;
  };
}

export function isTapEffectHomeItem(item: HomeEffectPlacement): boolean {
  return item.item.type === "object" && item.item.homeEffect === "lamp_light";
}

export function isSleepEffectHomeItem(item: HomeEffectPlacement): boolean {
  return item.item.type === "decor" && item.item.homeEffect === "sleep";
}

export function buildHomeLampItemEffects(
  items: readonly HomeEffectPlacement[],
  sceneHeight: number,
  enabledForItem: (item: HomeEffectPlacement) => boolean = item => item.effectEnabled === true,
): HouseInteriorEffect[] {
  return items
    .filter(item => isTapEffectHomeItem(item) && enabledForItem(item))
    .map(item => ({
      id: `home-item-lamp:${item.id}`,
      type: "lamp_light" as const,
      x: item.xPct,
      y: item.yPct,
      size: getHomeAttachedEffectSize(item.size, sceneHeight),
    }));
}

export function buildHomeSleepDecorEffects(
  items: readonly HomeEffectPlacement[],
  sceneHeight: number,
): HouseInteriorEffect[] {
  return items
    .filter(isSleepEffectHomeItem)
    .map(item => ({
      id: `home-decor-sleep:${item.id}`,
      type: "sleep" as const,
      x: item.xPct,
      y: item.yPct,
      size: getHomeAttachedEffectSize(item.size, sceneHeight),
    }));
}
