export const BEAU_PRIZE_WHEEL_WORLD_ID = "haunted_woods";
export const BEAU_PRIZE_WHEEL_NPC_NAME = "Beau";
export const BEAU_PRIZE_WHEEL_SLOT_COUNT = 8;
export const BEAU_PRIZE_WHEEL_PRIZE_SLOTS = 7;
export const BEAU_PRIZE_WHEEL_LOSS_SLOT = 7;
export const BEAU_PRIZE_WHEEL_PAID_COST = 500;

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
