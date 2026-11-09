import { z } from "zod";
import {
  PLAYER_CHARACTER_PART_TYPES,
  playerCharacterTransformSchema,
} from "./playerCharacter";

/**
 * Clothing ownership/category is independent of pet adornment type "costume".
 * The category list orders PLAYER CONTROLS, not 2D draw depth. In particular,
 * Back accessories may render behind the base torso, not on top of the face.
 */
export const PLAYER_CLOTHING_ITEM_TYPE = "clothing" as const;
export const PLAYER_CLOTHING_CATEGORIES = [
  "head", "hair", "face", "top", "bottom", "shoes", "back",
] as const;
export type PlayerClothingCategory = typeof PLAYER_CLOTHING_CATEGORIES[number];

export const PLAYER_CLOTHING_CATEGORY_LABELS: Record<PlayerClothingCategory, string> = {
  head: "Head", hair: "Hair", face: "Face", top: "Top",
  bottom: "Bottom", shoes: "Shoes", back: "Back Accessory",
};

/** Each clothing item may contain multiple uploaded images fitted to one
 * or more of the eight avatar animation anchors. Unused boxes are empty.
 * The admin fits layers once to the base rather than uploading separate
 * copies for every owner.
 */
export const PLAYER_CLOTHING_SEGMENT_TYPES = PLAYER_CHARACTER_PART_TYPES;
export const playerClothingCategorySchema = z.enum(PLAYER_CLOTHING_CATEGORIES);

/**
 * Suggested upload boxes in the future admin Create Clothing editor.
 * They are not mandatory: a skirt, cape, robe or unusual fantasy item may
 * fit to a different subset of animation parts.
 */
export const PLAYER_CLOTHING_DEFAULT_ATTACHMENTS: Record<
  PlayerClothingCategory, readonly (typeof PLAYER_CLOTHING_SEGMENT_TYPES)[number][]
> = {
  head: ["head"],
  hair: ["head"],
  face: ["head"],
  top: ["top", "left_arm", "right_arm"],
  bottom: ["left_leg", "right_leg"],
  shoes: ["left_foot", "right_foot"],
  back: ["top"],
};

/** Front/back layer choice per image segment, independent of the clothing
 * inventory category. Back gear often draws behind the torso but is still
 * attached to that torso so it follows animation.
 */
export const PLAYER_CLOTHING_RENDER_PLANES = [
  "behind_character", "with_part", "in_front_of_character",
] as const;
export const playerClothingRenderPlaneSchema = z.enum(PLAYER_CLOTHING_RENDER_PLANES);

/**
 * One uploaded image fitted to ONE rig part. The fit is part-local, not
 * whole-avatar placement: xPct/yPct/widthPct are relative to the attachment
 * part's unanimated image bounds. The renderer composes fit UNDER the parent
 * part's motion transform so leg pieces move with each respective leg.
 * Reuse bounded transform validation rather than a second coordinate system.
 */
export const playerClothingSegmentSchema = z.object({
  partType: z.enum(PLAYER_CLOTHING_SEGMENT_TYPES),
  imageUrl: z.string().regex(/^\/api\/media\/[a-zA-Z0-9-]{1,80}$/),
  fit: playerCharacterTransformSchema,
  renderPlane: playerClothingRenderPlaneSchema.default("with_part"),
}).strict();
export type PlayerClothingSegment = z.infer<typeof playerClothingSegmentSchema>;

export const playerClothingDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: playerClothingCategorySchema,
  // One clothing SKU can include sleeves, pant legs, separate shoes, etc.
  segments: z.array(playerClothingSegmentSchema).min(1).max(8),
}).strict().superRefine((value, ctx) => {
  const used = new Set<string>();
  value.segments.forEach((segment, index) => {
    if (used.has(segment.partType)) ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["segments", index, "partType"],
      message: "A clothing segment can be fitted to each base part only once",
    });
    used.add(segment.partType);
  });
});
export type PlayerClothingDefinition = z.infer<typeof playerClothingDefinitionSchema>;

