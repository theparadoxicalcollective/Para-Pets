export type PetFacing = "front" | "left" | "right" | "back" | string;

export const MULTI_HEAD_PREFIX = /^h([23])_/;
export const basePetPartType = (partType: string) => partType.replace(MULTI_HEAD_PREFIX, "");

export const FACE_PART_TYPES = new Set([
  "eyes", "eyes_closed", "left_ear", "right_ear", "left_ear_2", "right_ear_2",
  "mouth", "mouth_closed", "hair_left", "hair_right", "hair_center",
  "accessory_1", "accessory_2", "above_head",
]);

export const isHeadPart = (partType: string) => basePetPartType(partType) === "head";
export const isFacePart = (partType: string) =>
  !isHeadPart(partType) && FACE_PART_TYPES.has(basePetPartType(partType));
export const isHeadGroupPart = (partType: string) => isHeadPart(partType) || isFacePart(partType);
export const isSecondaryHeadPart = (partType: string) =>
  MULTI_HEAD_PREFIX.test(partType) && isHeadGroupPart(partType);

export const EAR_PART_TYPES = new Set(["left_ear", "right_ear", "left_ear_2", "right_ear_2"]);
export const HAIR_PART_TYPES = new Set(["hair_left", "hair_right", "hair_center", "back_hair"]);
export const PLANTED_PART_TYPES = new Set(["left_leg", "right_leg", "front_leg", "back_leg"]);

/** Canonical stacking bands. Saved zIndex remains the fallback for custom parts. */
export const PET_LAYER_ORDER: Readonly<Record<string, number>> = {
  head_wing_left: 1, head_wing_right: 1, tail: 1, tail_2: 1, tail_3: 1, back_hair: 1,
  back_wing: 2, back_wing_2: 2, right_wing: 2, left_wing: 2,
  wing_set2_left: 2, wing_set2_right: 2,
  back_leg: 3, back_accessory_2: 3, back_accessory_1: 3,
  front_left_accessory: 3, front_right_accessory: 3,
  back_arm: 4, back_shoulder: 4, body_2: 4.5,
  body: 5, right_arm: 5, left_arm: 5, front_arm: 5,
  left_shoulder: 5, right_shoulder: 5,
  neck: 6, front_wing_2: 6, front_wing: 6, front_accessory_2: 6, front_accessory_1: 6,
  // Paired front-view legs cover the lower body seam; side view retains back/front depth.
  right_leg: 7, left_leg: 7, front_leg: 7, left_hand: 7, right_hand: 7,
  front_shoulder: 8, right_ear: 9, left_ear: 9, right_ear_2: 9, left_ear_2: 9,
  head: 10, accessory_2: 11, accessory_1: 11, mouth: 12, mouth_closed: 13,
  eyes_closed: 14, eyes: 15, hair_right: 16, hair_left: 17, hair_center: 18, above_head: 19,
};

export interface LayerablePetPart { partType: string; zIndex: number }

export function getEffectivePetLayer(part: LayerablePetPart, facing: PetFacing = "front"): number {
  const base = basePetPartType(part.partType);
  if (isSecondaryHeadPart(part.partType)) return 4 + (PET_LAYER_ORDER[base] ?? 10) * 0.001;
  if ((facing === "left" || facing === "right") && base === "front_leg") return 20;
  return PET_LAYER_ORDER[base] ?? part.zIndex;
}

export const sortPetPartsByLayer = <T extends LayerablePetPart>(parts: readonly T[], facing?: PetFacing) =>
  [...parts].sort((a, b) => getEffectivePetLayer(a, facing) - getEffectivePetLayer(b, facing));
