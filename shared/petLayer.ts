/**
 * Canonical pet-part stacking rules used by editor previews, runtime renderers,
 * GIF export, and server-side assembled images.  Lower values draw first.
 *
 * Persisted zIndex is deliberately retained as the fallback for unknown/custom
 * part keys; established part keys use these semantic bands so upload order
 * can never change a pet's silhouette.
 */
export type PetFacing = "front" | "left" | "right" | "back" | string;

export const MULTI_HEAD_PREFIX = /^h([23])_/;
export const basePetPartType = (partType: string) => partType.replace(MULTI_HEAD_PREFIX, "");

export const FACE_PART_TYPES = new Set([
  "eyes", "eyes_closed", "left_ear", "right_ear", "left_ear_2", "right_ear_2",
  "mouth", "mouth_closed", "hair_left", "hair_right", "hair_center",
  "accessory_1", "accessory_2", "above_head",
]);
export const isHeadPart = (partType: string) => basePetPartType(partType) === "head";
export const isFacePart = (partType: string) => !isHeadPart(partType) && FACE_PART_TYPES.has(basePetPartType(partType));
export const isHeadGroupPart = (partType: string) => isHeadPart(partType) || isFacePart(partType);
export const isSecondaryHeadPart = (partType: string) => MULTI_HEAD_PREFIX.test(partType) && isHeadGroupPart(partType);
export const EAR_PART_TYPES = new Set(["left_ear", "right_ear", "left_ear_2", "right_ear_2"]);
export const HAIR_PART_TYPES = new Set(["hair_left", "hair_right", "hair_center", "back_hair"]);
export const PLANTED_PART_TYPES = new Set(["left_leg", "right_leg", "front_leg", "back_leg"]);

export const PET_LAYER_ORDER: Readonly<Record<string, number>> = {
  head_wing_left: 1, head_wing_right: 1, tail: 1, tail_2: 1, tail_3: 1, back_hair: 1,
  back_wing: 2, back_wing_2: 2, right_wing: 2, left_wing: 2, wing_set2_left: 2, wing_set2_right: 2,
  back_leg: 3, back_accessory_2: 3, back_accessory_1: 3, front_left_accessory: 3, front_right_accessory: 3,
  back_arm: 4, back_shoulder: 4, body_2: 4.5,
  // Front-view limbs deliberately sit above the body.  The former tie with
  // body made their depth depend on database/upload order (notably left_arm).
  body: 5,
  right_arm: 6, left_arm: 6, front_arm: 6, left_shoulder: 6, right_shoulder: 6,
  neck: 7, front_wing_2: 7, front_wing: 7,
  front_accessory_2: 8, front_accessory_1: 8, right_leg: 8, left_leg: 8, front_leg: 8, left_hand: 9, right_hand: 9,
  front_shoulder: 9, right_ear: 10, left_ear: 10, right_ear_2: 10, left_ear_2: 10,
  head: 11, accessory_2: 12, accessory_1: 12, mouth: 13, mouth_closed: 14,
  eyes_closed: 15, eyes: 16, hair_right: 17, hair_left: 18, hair_center: 19, above_head: 20,
};

export interface LayerablePetPart { partType: string; zIndex: number }
export function getEffectivePetLayer(part: LayerablePetPart, facing: PetFacing = "front"): number {
  const base = basePetPartType(part.partType);
  if (isSecondaryHeadPart(part.partType)) return 4 + (PET_LAYER_ORDER[base] ?? 10) * 0.001;
  if ((facing === "left" || facing === "right") && base === "front_leg") return 21;
  return PET_LAYER_ORDER[base] ?? part.zIndex;
}
export const sortPetPartsByLayer = <T extends LayerablePetPart>(parts: readonly T[], facing?: PetFacing) =>
  [...parts].sort((a, b) => getEffectivePetLayer(a, facing) - getEffectivePetLayer(b, facing));
