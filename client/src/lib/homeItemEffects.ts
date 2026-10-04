import {
  type HomeCatalogEffect,
  type HomeSceneItemType,
  type HouseInteriorEffect,
} from "@shared/housing";

export interface HomeEffectPlacement {
  id: string;
  xPct: number;
  yPct: number;
  size: number;
  flipped?: boolean;
  effectEnabled?: boolean;
  item: {
    type: HomeSceneItemType;
    homeEffect?: HomeCatalogEffect | null;
    imageUrl?: string | null;
    homeTapImageUrl?: string | null;
    homeEffectX?: number;
    homeEffectY?: number;
    homeEffectSize?: number;
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

function buildAttachedEffect(
  item: HomeEffectPlacement,
  type: "lamp_light" | "sleep",
  sceneHeight: number,
  imageWidth: number,
  idPrefix: string,
): HouseInteriorEffect {
  const safeHeight = Math.max(1, sceneHeight);
  const safeWidth = Math.max(1, imageWidth);
  const localX = Number.isFinite(item.item.homeEffectX) ? Number(item.item.homeEffectX) : 0.5;
  const localY = Number.isFinite(item.item.homeEffectY) ? Number(item.item.homeEffectY) : 0.5;
  const localSize = Number.isFinite(item.item.homeEffectSize) ? Number(item.item.homeEffectSize) : 40;
  const horizontalDirection = (item as HomeEffectPlacement & { flipped?: boolean }).flipped ? -1 : 1;
  const xOffsetPx = (localX - 0.5) * item.size * horizontalDirection;
  const yOffsetPx = (localY - 0.5) * item.size;
  const effectSizePx = item.size * Math.max(0.1, Math.min(2.2, localSize / 100));

  return {
    id: `${idPrefix}:${item.id}`,
    type,
    x: Math.max(0, Math.min(1, item.xPct + xOffsetPx / safeWidth)),
    y: Math.max(0, Math.min(1, item.yPct + yOffsetPx / safeHeight)),
    size: Math.max(4, Math.min(40, (effectSizePx / safeHeight) * 100)),
  };
}

export function buildHomeLampItemEffects(
  items: readonly HomeEffectPlacement[],
  sceneHeight: number,
  enabledForItem: (item: HomeEffectPlacement) => boolean = item => item.effectEnabled === true,
  imageWidth = sceneHeight,
): HouseInteriorEffect[] {
  return items
    .filter(item => isLampLightHomeItem(item) && enabledForItem(item))
    .map(item => buildAttachedEffect(item, "lamp_light", sceneHeight, imageWidth, "home-item-lamp"));
}

export function broadenHomeAttachedLampIllumination(
  effects: readonly HouseInteriorEffect[],
): HouseInteriorEffect[] {
  return effects.map(effect => {
    if (effect.type !== "lamp_light") return effect;

    const visibleSize = Math.max(4, effect.size);
    // Larger Admin-authored Lamp Lights should light a larger surrounding area,
    // not just draw a larger glow. The multiplier grows mildly with the saved
    // visual size, while this runtime-only footprint stays capped for mobile.
    const sizeScale = 1.18 + Math.min(0.20, visibleSize / 140);
    return {
      ...effect,
      size: Math.min(46, visibleSize * sizeScale),
    };
  });
}

export function buildHomeSleepDecorEffects(
  items: readonly HomeEffectPlacement[],
  sceneHeight: number,
  imageWidth = sceneHeight,
): HouseInteriorEffect[] {
  return items
    .filter(isSleepEffectHomeItem)
    .map(item => buildAttachedEffect(item, "sleep", sceneHeight, imageWidth, "home-decor-sleep"));
}
