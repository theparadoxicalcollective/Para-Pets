export const BEAU_PRIZE_WHEEL_WORLD_ID = "haunted_woods";
export const BEAU_PRIZE_WHEEL_NPC_NAME = "Beau";
export const BEAU_PRIZE_WHEEL_SLOT_COUNT = 8;
export const BEAU_PRIZE_WHEEL_PRIZE_SLOTS = 7;
export const BEAU_PRIZE_WHEEL_LOSS_SLOT = 7;
export const BEAU_PRIZE_WHEEL_PAID_COST = 2500;
// HauntedSpinMain.png is square. The arrow PNG is 1536 × 1024.
export const BEAU_WHEEL_STAGE_RATIO = 1;
export const BEAU_ARROW_HEIGHT_RATIO = 1024 / 1536;
export const BEAU_WHEEL_SIZE_RANGE = { min: 20, max: 80 };
export const BEAU_ARROW_SIZE_RANGE = { min: 5, max: 50 };
export const BEAU_GHOST_SIZE_RANGE = { min: 5, max: 45 };
export const HAUNTED_SPIN_DECOR_ART = "/world-assets/uploads/HauntedSpinDecor.png";

// Position and diameter are percentages of the artwork stage width/height.
export interface BeauWheelLayout {
  left: number;
  top: number;
  size: number;
}

export interface BeauPointerLayout {
  x: number;
  y: number;
  size: number;
}

// The wheel overlays the baked-in gold rim; its center is (50%, 45%).
// The pointer artwork faces down by default, just above the wheel.
export const DEFAULT_BEAU_WHEEL_LAYOUT: BeauWheelLayout = {
  left: 26.6,
  top: 21.6,
  size: 46.8,
};

export const DEFAULT_BEAU_POINTER_LAYOUT: BeauPointerLayout = {
  x: 50,
  y: 15.1,
  size: 40,
};

export const DEFAULT_BEAU_GHOST_LAYOUT: BeauPointerLayout = {
  x: 84,
  y: 25,
  size: 22,
};

const round = (value: number) => Math.round(value * 100) / 100;

export function beauWheelLayoutFrom(value: unknown): BeauWheelLayout | null {
  if (!value || typeof value !== "object") return null;
  const { left, top, size } = value as Partial<BeauWheelLayout>;
  if (typeof left !== "number" || typeof top !== "number" || typeof size !== "number" ||
      !Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(size) ||
      size < BEAU_WHEEL_SIZE_RANGE.min || size > BEAU_WHEEL_SIZE_RANGE.max ||
      left < 0 || left + size > 100 || top < 0 || top + size * BEAU_WHEEL_STAGE_RATIO > 100) return null;
  return { left: round(left), top: round(top), size: round(size) };
}

/** Shared by the client drag/resize clamp and server placement validation. */
export function clampBeauLayerLayout(layout: BeauPointerLayout, layer: "arrow" | "ghost"): BeauPointerLayout {
  const range = layer === "arrow" ? BEAU_ARROW_SIZE_RANGE : BEAU_GHOST_SIZE_RANGE;
  const size = round(Math.max(range.min, Math.min(range.max, layout.size)));
  const halfWidth = size / 2;
  const halfHeight = size * (layer === "arrow" ? BEAU_ARROW_HEIGHT_RATIO : 1) * BEAU_WHEEL_STAGE_RATIO / 2;
  return {
    x: Math.max(Math.ceil(halfWidth * 100) / 100, Math.min(Math.floor((100 - halfWidth) * 100) / 100, round(layout.x))),
    y: Math.max(Math.ceil(halfHeight * 100) / 100, Math.min(Math.floor((100 - halfHeight) * 100) / 100, round(layout.y))),
    size,
  };
}

function beauLayerLayoutFrom(value: unknown, layer: "arrow" | "ghost"): BeauPointerLayout | null {
  if (!value || typeof value !== "object") return null;
  const { x, y, size } = value as Partial<BeauPointerLayout>;
  if (typeof x !== "number" || typeof y !== "number" || typeof size !== "number" ||
      !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size)) return null;
  const range = layer === "arrow" ? BEAU_ARROW_SIZE_RANGE : BEAU_GHOST_SIZE_RANGE;
  const halfWidth = size / 2;
  const halfHeight = size * (layer === "arrow" ? BEAU_ARROW_HEIGHT_RATIO : 1) * BEAU_WHEEL_STAGE_RATIO / 2;
  if (size < range.min || size > range.max ||
      x < halfWidth || x > 100 - halfWidth || y < halfHeight || y > 100 - halfHeight) return null;
  return clampBeauLayerLayout({ x, y, size }, layer);
}

export function beauPointerLayoutFrom(value: unknown): BeauPointerLayout | null {
  return beauLayerLayoutFrom(value, "arrow");
}

export function beauGhostLayoutFrom(value: unknown): BeauPointerLayout | null {
  return beauLayerLayoutFrom(value, "ghost");
}

export function beauPointerAngle(wheel: BeauWheelLayout, pointer: BeauPointerLayout): number {
  const centerX = wheel.left + wheel.size / 2;
  const centerY = wheel.top + wheel.size * BEAU_WHEEL_STAGE_RATIO / 2;
  const dx = pointer.x - centerX;
  const dyInStageWidth = (pointer.y - centerY) / BEAU_WHEEL_STAGE_RATIO;
  const angle = Math.atan2(dx, -dyInStageWidth) * 180 / Math.PI;
  return ((angle % 360) + 360) % 360;
}

export type BeauPrizeRarity = "common" | "uncommon" | "rare";
export const BEAU_RARITY_WEIGHTS: Record<BeauPrizeRarity, number> = { common: 6, uncommon: 3, rare: 1 };

export function beauPrizeWeight(rarity: BeauPrizeRarity = "common"): number { return BEAU_RARITY_WEIGHTS[rarity]; }

export function beauWheelOdds(rarities: BeauPrizeRarity[]): number[] {
  const weights = rarities.map(beauPrizeWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map(weight => weight / total);
}

export type BeauPrizeKind = "coins" | "essence" | "exp" | "item" | "egg";

export interface BeauPrizeConfig {
  slot: number;
  kind: BeauPrizeKind;
  rarity?: BeauPrizeRarity;
  amount?: number;
  shopItemId?: string;
}

export interface BeauPrizeView {
  slot: number;
  configured: boolean;
  rarity?: BeauPrizeRarity;
  chance?: number;
  kind: BeauPrizeKind | "loss" | null;
  label: string;
  imageUrl: string | null;
  amount: number | null;
  shopItemId: string | null;
}

export function beauWheelSlotCenterAngle(slot: number): number {
  // In HauntedSpinWheel.png the upper spade is a segment center, not a boundary.
  return Math.max(0, Math.min(BEAU_PRIZE_WHEEL_SLOT_COUNT - 1, slot)) * 45;
}

export function beauWheelLandingRotation(slot: number, pointerAngle = 0): number {
  const raw = pointerAngle - beauWheelSlotCenterAngle(slot);
  return ((raw % 360) + 360) % 360;
}
