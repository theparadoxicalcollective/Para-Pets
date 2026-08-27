/**
 * Costume feature contracts shared by the player and admin flows.
 *
 * Keep costume-specific rules here instead of duplicating slot prices or
 * renderer semantics across components. This is intentionally additive: the
 * first costume rollout can introduce the contract without changing the
 * existing accessory system.
 */

export const COSTUME_SLOT_COUNT = 3 as const;

/** One fitted costume can be duplicated three times on the same pet template. */
export const COSTUME_MAX_DUPLICATES_PER_PET = 3 as const;
/** Original artwork + the three allowed duplicates. */
export const COSTUME_MAX_PLACEMENT_INSTANCES = 4 as const;

/** Number of costume slots available without spending coins. */
export const COSTUME_BASE_SLOTS = 1 as const;

/** Coin cost to unlock costume slot 2. */
export const COSTUME_SLOT_2_COST = 5_000 as const;

/** Coin cost to unlock costume slot 3. */
export const COSTUME_SLOT_3_COST = 10_000 as const;

export const COSTUME_SLOT_UNLOCK_COSTS = [0, COSTUME_SLOT_2_COST, COSTUME_SLOT_3_COST] as const;

export type CostumeView = "front" | "side";
export type CostumeDepth = "front" | "back";

/**
 * The pet part to which a costume is attached. The value intentionally uses
 * the existing pet-template part keys rather than introducing a second bone
 * or coordinate system. New part keys can be added as the pet editor grows.
 */
export type CostumeAnchorPart = string;

/**
 * Saved placement for one view of a costume on one pet template.
 *
 * Coordinates are interpreted in the same normalized/template space used by
 * the existing pet-template part editor. They are not device pixels.
 */
export interface CostumePlacement {
  view: CostumeView;
  anchorPart: CostumeAnchorPart;
  /** 1 is the original fitted piece; 2-4 are admin-created visual duplicates. */
  instance?: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  /** Clockwise rotation in degrees around the saved pivot. Older placements default to 0. */
  rotation?: number;
  /** Mirror the costume artwork horizontally before rotation. Older placements default to false. */
  flipX?: boolean;
  depth: CostumeDepth;
}

/**
 * A costume definition belongs to an item and a pet template. The item is
 * still the player's inventory object; this definition only describes how
 * that item is rendered when equipped on this particular pet template.
 */
export interface CostumeDefinition {
  itemId: string;
  templateId: string;
  placements: CostumePlacement[];
}

/** Runtime assignment of a player's costume inventory item to a pet slot. */
export interface EquippedCostume {
  petInventoryId: string;
  costumeInventoryId: string;
  slot: number;
}

export function getCostumeSlotUnlockCost(slot: number): number {
  if (slot < 1 || slot > COSTUME_SLOT_COUNT) return 0;
  return COSTUME_SLOT_UNLOCK_COSTS[slot - 1] ?? 0;
}

export function getUnlockedCostumeSlotCount(extraSlots: number): number {
  return Math.min(COSTUME_SLOT_COUNT, COSTUME_BASE_SLOTS + Math.max(0, extraSlots));
}
