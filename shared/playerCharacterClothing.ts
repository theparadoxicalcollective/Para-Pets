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
export const playerClothingSegmentSchema = playerCharacterTransformSchema.extend({
  partType: z.enum(PLAYER_CLOTHING_SEGMENT_TYPES),
  imageUrl: z.string().regex(/^\/api\/media\/[a-zA-Z0-9-]{1,80}$/),
});
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

/** Draw order is resolved by attachment + front/back layering in 07B/08,
 * not by the menu category enumeration.
 */
export const PLAYER_CLOTHING_RENDER_PLANES = [
  "behind_character", "with_part", "in_front_of_character",
] as const;
