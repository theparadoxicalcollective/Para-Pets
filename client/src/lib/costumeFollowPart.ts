import { ADORNMENT_SLOT_MAP, type CostumePlacement } from "@shared/costumeFeature";

/** Head fittings always follow their selected head unless the item is fixed.
 * Other slots opt into matching-part motion through Follow Part. */
export function semanticFollowPartType(
  slot: number,
  effect: string | null | undefined,
  placement: Pick<CostumePlacement, "followPartIndex" | "animation">,
): string | null {
  if (slot === ADORNMENT_SLOT_MAP.head) {
    return ["head", "h2_head", "h3_head"][(placement.followPartIndex ?? 1) - 1] ?? "head";
  }
  if (effect !== "follow_part" && placement.animation !== "follow_part") return null;
  if (slot === ADORNMENT_SLOT_MAP.left_hand) return "left_hand";
  if (slot === ADORNMENT_SLOT_MAP.right_hand) return "right_hand";
  if (slot === ADORNMENT_SLOT_MAP.back) return "body";
  return null;
}
