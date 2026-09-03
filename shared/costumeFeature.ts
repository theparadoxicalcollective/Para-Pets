import { ADORNMENT_IMAGE_URL_PATTERN, normalizeAdornmentAnimation, type AdornmentAnimation } from "./adornmentAnimation";

/**
 * Costume feature contracts shared by the player and admin flows.
 *
 * Keep costume-specific rules here instead of duplicating slot prices or
 * renderer semantics across components. This is intentionally additive: the
 * first costume rollout can introduce the contract without changing the
 * existing accessory system.
 */

export const COSTUME_SLOT_COUNT = 5 as const;

/** One fitted costume can be duplicated three times on the same pet template. */
export const COSTUME_MAX_DUPLICATES_PER_PET = 3 as const;
/** Original artwork + the three allowed duplicates. These are visual placements, not extra inventory copies. */
export const COSTUME_MAX_PLACEMENT_INSTANCES = 4 as const;

/** Number of costume slots available without spending coins. */
export const COSTUME_BASE_SLOTS = 3 as const;

/** Coin cost to unlock the first paid costume slot. */
export const COSTUME_SLOT_4_COST = 5_000 as const;

/** Coin cost to unlock the second paid costume slot. */
export const COSTUME_SLOT_5_COST = 10_000 as const;

export const COSTUME_SLOT_UNLOCK_COSTS = [0, 0, 0, COSTUME_SLOT_4_COST, COSTUME_SLOT_5_COST] as const;

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
  /** "independent" uses the pet canvas; all other values retain legacy part attachment. */
  anchorPart: CostumeAnchorPart;
  animation?: AdornmentAnimation;
  animationSpeed?: number;
  /** Optional opposite-facing artwork, used only for independent Wings motion. */
  mirroredWingImageUrl?: string;
  replacesWings?: boolean;
  /** 1 is the original fitted piece; 2-4 are admin-created visual duplicates. Front/side placements reuse the same instance number. */
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


/**
 * A costume fitted to a wing replaces the pet's original wing artwork.
 * Return both sides of a recognized pair so mirrored wing layers disappear
 * together. Non-wing anchors return an empty list and never hide pet parts.
 */
function finitePlacementNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/** Normalize legacy/admin-authored placement JSON before any renderer or route reads it. */
export function normalizeCostumePlacements(value: unknown): CostumePlacement[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const placement = candidate as Record<string, unknown>;
    const view = placement.view === "front" || placement.view === "side" ? placement.view : null;
    const depth = placement.depth === "front" || placement.depth === "back" ? placement.depth : null;
    const anchorPart = typeof placement.anchorPart === "string" ? placement.anchorPart.trim() : "";
    const width = finitePlacementNumber(placement.width, 0);
    const height = finitePlacementNumber(placement.height, 0);
    if (!view || !depth || !anchorPart || width <= 0 || height <= 0) return [];

    return [{
      view,
      depth,
      anchorPart,
      ...(anchorPart === "independent" ? {
        animation: normalizeAdornmentAnimation(placement.animation),
        animationSpeed: Math.max(0.25, Math.min(2, finitePlacementNumber(placement.animationSpeed, 1))),
        replacesWings: placement.replacesWings === true,
        ...(typeof placement.mirroredWingImageUrl === "string" && ADORNMENT_IMAGE_URL_PATTERN.test(placement.mirroredWingImageUrl)
          ? { mirroredWingImageUrl: placement.mirroredWingImageUrl } : {}),
      } : {}),
      instance: Math.max(1, Math.min(
        COSTUME_MAX_PLACEMENT_INSTANCES,
        Math.trunc(finitePlacementNumber(placement.instance, 1)),
      )),
      posX: finitePlacementNumber(placement.posX, 0),
      posY: finitePlacementNumber(placement.posY, 0),
      width,
      height,
      pivotX: finitePlacementNumber(placement.pivotX, 50),
      pivotY: finitePlacementNumber(placement.pivotY, 50),
      rotation: finitePlacementNumber(placement.rotation, 0),
      flipX: placement.flipX === true,
    }];
  });
}

export function getWingReplacementPartTypes(anchorPart: string): string[] {
  if (typeof anchorPart !== "string" || !anchorPart) return [];
  const sidePair = anchorPart.match(/^(left|right)_wing(_\d+)?$/);
  if (sidePair) {
    const suffix = sidePair[2] ?? "";
    return [`left_wing${suffix}`, `right_wing${suffix}`];
  }

  const setPair = anchorPart.match(/^(wing_set\d+)_(left|right)$/);
  if (setPair) return [`${setPair[1]}_left`, `${setPair[1]}_right`];

  const headPair = anchorPart.match(/^((?:h[23]_)?head_wing)_(left|right)$/);
  if (headPair) return [`${headPair[1]}_left`, `${headPair[1]}_right`];

  const depthPair = anchorPart.match(/^(front|back)_wing(_\d+)?$/);
  if (depthPair) {
    const suffix = depthPair[2] ?? "";
    return [`front_wing${suffix}`, `back_wing${suffix}`];
  }

  return anchorPart.includes("wing") ? [anchorPart] : [];
}
