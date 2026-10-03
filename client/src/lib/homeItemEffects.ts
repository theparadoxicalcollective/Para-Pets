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
    imageUrl?: string | null;
    homeTapImageUrl?: string | null;
  };
}

export function isTapEffectHomeItem(item: HomeEffectPlacement): boolean {
  return item.item.homeEffect === "lamp_light"
    || (item.item.type === "object" && item.item.homeEffect === "tap");
}

export function isLampLightHomeItem(item: HomeEffectPlacement): boolean {
  return item.item.homeEffect === "lamp_light";
}

export function getHomeItemDisplayImage(item: HomeEffectPlacement, enabled = item.effectEnabled === true): string | null {
  if (
    item.item.type === "object"
    && item.item.homeEffect === "tap"
    && enabled
    && item.item.homeTapImageUrl
  ) {
    return item.item.homeTapImageUrl;
  }
  return item.item.imageUrl ?? null;
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
    .filter(item => isLampLightHomeItem(item) && enabledForItem(item))
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
