export const BEAU_PRIZE_WHEEL_WORLD_ID = "haunted_woods";
export const BEAU_PRIZE_WHEEL_NPC_NAME = "Beau";
export const BEAU_PRIZE_WHEEL_SLOT_COUNT = 8;
export const BEAU_PRIZE_WHEEL_PRIZE_SLOTS = 7;
export const BEAU_PRIZE_WHEEL_LOSS_SLOT = 7;
export const BEAU_PRIZE_WHEEL_PAID_COST = 1000;


// Position and diameter are percentages of the Beau artwork stage width/height.
export interface BeauWheelLayout {
  left: number;
  top: number;
  size: number;
}

// Slightly fill the gold rim by default; admins can fine tune this for their art.
export const DEFAULT_BEAU_WHEEL_LAYOUT: BeauWheelLayout = {
  left: 25.55,
  top: 32.47,
  size: 69.5,
};

export function beauWheelLayoutFrom(value: unknown): BeauWheelLayout | null {
  if (!value || typeof value !== "object") return null;
  const { left, top, size } = value as Partial<BeauWheelLayout>;
  if (typeof left !== "number" || typeof top !== "number" || typeof size !== "number" ||
      !Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(size) ||
      size < 55 || size > 78 || left < 0 || left + size > 100 ||
      top < 0 || top + size * (1122 / 1402) > 100) return null;
  return { left: Math.round(left * 100) / 100, top: Math.round(top * 100) / 100, size: Math.round(size * 100) / 100 };
}

export type BeauPrizeKind = "coins" | "essence" | "exp" | "item" | "egg";

export interface BeauPrizeConfig {
  slot: number;
  kind: BeauPrizeKind;
  amount?: number;
  shopItemId?: string;
}

export interface BeauPrizeView {
  slot: number;
  configured: boolean;
  kind: BeauPrizeKind | "loss" | null;
  label: string;
  imageUrl: string | null;
  amount: number | null;
  shopItemId: string | null;
}

export function beauWheelSlotCenterAngle(slot: number): number {
  return 22.5 + Math.max(0, Math.min(BEAU_PRIZE_WHEEL_SLOT_COUNT - 1, slot)) * 45;
}

export function beauWheelLandingRotation(slot: number): number {
  const raw = 360 - beauWheelSlotCenterAngle(slot);
  return ((raw % 360) + 360) % 360;
}
