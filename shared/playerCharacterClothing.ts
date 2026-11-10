import { z } from "zod";
import {
  PLAYER_CHARACTER_PART_TYPES,
  playerCharacterTransformSchema,
  type PlayerCharacterPartType,
  type PlayerCharacterTransform,
} from "./playerCharacter";

/** Wardrobe ownership categories. Front and back hair are one inventory item. */
export const PLAYER_CLOTHING_ITEM_TYPE = "clothing" as const;
export const PLAYER_CLOTHING_CATEGORIES = [
  "accessories", "head", "hair", "face", "top", "bottom", "shoes", "back",
] as const;
export type PlayerClothingCategory = typeof PLAYER_CLOTHING_CATEGORIES[number];
export const PLAYER_CLOTHING_CATEGORY_LABELS: Record<PlayerClothingCategory,string> = {
  accessories: "Accessories",
  head: "Head Accessories",
  hair: "Hair",
  face: "Face",
  top: "Tops",
  bottom: "Bottoms",
  shoes: "Shoes",
  back: "Back Accessories",
};

/**
 * Different artwork pieces may share the same animated body attachment:
 * front/back hair and open/closed eyes/mouth all follow the HEAD.
 * Existing published records without a slot remain readable as the
 * corresponding anatomy part name.
 */
export const PLAYER_CLOTHING_SEGMENT_TYPES = PLAYER_CHARACTER_PART_TYPES;
export const PLAYER_CLOTHING_SPECIAL_SLOTS = [
  "hair_front", "hair_back",
  "face_open_eyes", "face_closed_eyes", "face_mouth",
] as const;
export const PLAYER_CLOTHING_SLOTS = [
  ...PLAYER_CHARACTER_PART_TYPES, ...PLAYER_CLOTHING_SPECIAL_SLOTS,
] as const;
export type PlayerClothingSlot = typeof PLAYER_CLOTHING_SLOTS[number];
export const playerClothingSlotSchema = z.enum(PLAYER_CLOTHING_SLOTS);
export const playerClothingCategorySchema = z.enum(PLAYER_CLOTHING_CATEGORIES);

export function clothingSlotPartType(slot: PlayerClothingSlot): PlayerCharacterPartType {
  return (PLAYER_CLOTHING_SPECIAL_SLOTS as readonly string[]).includes(slot)
    ? "head" : slot as PlayerCharacterPartType;
}

/** Upload boxes are bounded, but one item can contain multiple images. */
export const PLAYER_CLOTHING_UPLOAD_SLOTS: Record<PlayerClothingCategory, readonly PlayerClothingSlot[]> = {
  accessories: ["head", "top", "left_arm", "right_arm"],
  head: ["head"],
  hair: ["hair_front", "hair_back"],
  face: ["face_open_eyes", "face_closed_eyes", "face_mouth"],
  top: ["top", "left_arm", "right_arm"],
  bottom: ["left_leg", "right_leg", "top"],
  shoes: ["left_foot", "right_foot"],
  back: ["top"],
};

/** Older callers select the default anatomy anchors by clothing category. */
export const PLAYER_CLOTHING_DEFAULT_ATTACHMENTS: Record<PlayerClothingCategory, readonly PlayerCharacterPartType[]> = {
  accessories: ["head", "top", "left_arm", "right_arm"],
  head: ["head"],
  hair: ["head"],
  face: ["head"],
  top: ["top", "left_arm", "right_arm"],
  bottom: ["left_leg", "right_leg"],
  shoes: ["left_foot", "right_foot"],
  back: ["top"],
};

export const PLAYER_CLOTHING_RENDER_PLANES = [
  "behind_character", "with_part", "in_front_of_character",
] as const;
export const playerClothingRenderPlaneSchema = z.enum(PLAYER_CLOTHING_RENDER_PLANES);

export const canvasClothingFit = (): PlayerCharacterTransform => ({
  xPct: 50, yPct: 50, widthPct: 100,
  pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: 1,
});

/** Stable global depth: Back < Hair Back < Body < Shoes < Bottoms < Tops
 * < Face < Hair Front < Head Accessories < Accessories. */
export function clothingLayerDepth(category: PlayerClothingCategory, slot?: string): number {
  if (category === "back") return -10;
  if (category === "hair" && slot === "hair_back") return -5;
  if (category === "shoes") return 35;
  if (category === "bottom") return 55;
  if (category === "top") return 75;
  if (category === "face") return slot === "face_mouth" ? 102 : 100;
  if (category === "hair") return 110;
  if (category === "head") return 120;
  return 130; // Accessories, above all other artwork
}

/** Saved segment shape retains legacy local-fit data for older items.
 * New editor uploads set canvasAligned=true and receive no offsets. */
export const playerClothingSegmentSchema = z.object({
  partType: z.enum(PLAYER_CLOTHING_SEGMENT_TYPES),
  slot: playerClothingSlotSchema.optional(),
  canvasAligned: z.boolean().optional(),
  imageUrl: z.string().regex(/^\/api\/media\/[a-zA-Z0-9-]{1,80}$/),
  fit: playerCharacterTransformSchema,
  renderPlane: playerClothingRenderPlaneSchema.default("with_part"),
}).strict().superRefine((segment, ctx) => {
  if (segment.slot && clothingSlotPartType(segment.slot) !== segment.partType) {
    ctx.addIssue({ code: "custom", message: "Clothing slot must match its animated attachment", path: ["partType"] });
  }
});
export type PlayerClothingSegment = z.infer<typeof playerClothingSegmentSchema>;
export const clothingSegmentKey = (segment: Pick<PlayerClothingSegment,"partType"|"slot">) =>
  segment.slot ?? segment.partType;

export const playerClothingDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: playerClothingCategorySchema,
  segments: z.array(playerClothingSegmentSchema).min(1).max(13),
}).strict().superRefine(({ segments, category }, ctx) => {
  const used = new Set<string>();
  segments.forEach((segment, index) => {
    const key = clothingSegmentKey(segment);
    if (used.has(key)) {
      ctx.addIssue({ code: "custom", path: ["segments", index, "slot"],
        message: "Each clothing image slot may be used once" });
    }
    used.add(key);
    if (segment.canvasAligned && segment.slot &&
        !(PLAYER_CLOTHING_UPLOAD_SLOTS[category] as readonly string[]).includes(segment.slot)) {
      ctx.addIssue({ code: "custom", path: ["segments", index, "slot"],
        message: "This image slot is not part of this clothing category" });
    }
  });
});
export type PlayerClothingDefinition = z.infer<typeof playerClothingDefinitionSchema>;
