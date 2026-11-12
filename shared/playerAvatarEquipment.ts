import { z } from "zod";
import { playerClothingCategorySchema } from "./playerCharacterClothing";
import { playerSkinToneSchema } from "./playerSkinTone";

/**
 * A published admin base is NOT a created player avatar. Only an explicit
 * authenticated first save creates the per-account record. Rendering Home's
 * "Design Character" prompt can therefore check created === false.
 */
/** Only the first Create Character save requires these wardrobe categories.
 * Optional selections are included in the same transaction so nothing
 * previewed before creation is silently lost. */
export const REQUIRED_AVATAR_CREATION_CATEGORIES = ["top", "bottom", "face"] as const;
export const avatarCreationItemSchema = z.object({
  inventoryId: z.string().uuid(),
  colorTint: playerSkinToneSchema.optional(),
}).strict();
export const avatarCreationOutfitSchema = z.object({
  top: avatarCreationItemSchema,
  bottom: avatarCreationItemSchema,
  face: avatarCreationItemSchema,
  head: avatarCreationItemSchema.optional(),
  hair: avatarCreationItemSchema.optional(),
  shoes: avatarCreationItemSchema.optional(),
  back: avatarCreationItemSchema.optional(),
  accessories: avatarCreationItemSchema.optional(),
}).strict();
export type AvatarCreationOutfit = z.infer<typeof avatarCreationOutfitSchema>;

export const createPlayerAvatarSchema = z.object({
  baseId: z.string().uuid(),
  skinTone: playerSkinToneSchema.optional(),
  topTucked: z.boolean().optional(),
  outfit: avatarCreationOutfitSchema,
}).strict();

/** A single revision-checked edit commit for body, tone, tuck, and the entire
 * outfit. Each key is explicit so an omitted garment cannot be mistaken for
 * a request to remove it. Null means an intentionally empty slot. */
export const savePlayerAvatarCharacterSchema = z.object({
  expectedRevision: z.number().int().min(0),
  baseId: z.string().uuid(),
  skinTone: playerSkinToneSchema.optional(),
  topTucked: z.boolean(),
  outfit: z.object({
    head: avatarCreationItemSchema.nullable(),
    hair: avatarCreationItemSchema.nullable(),
    face: avatarCreationItemSchema.nullable(),
    top: avatarCreationItemSchema.nullable(),
    bottom: avatarCreationItemSchema.nullable(),
    shoes: avatarCreationItemSchema.nullable(),
    back: avatarCreationItemSchema.nullable(),
    accessories: avatarCreationItemSchema.nullable(),
  }).strict(),
}).strict();
export type AvatarCharacterOutfit = z.infer<typeof savePlayerAvatarCharacterSchema>["outfit"];

export const changePlayerAvatarBaseSchema = z.object({
  baseId: z.string().uuid(),
  skinTone: playerSkinToneSchema.optional(),
  // Skin-only edits retain the player's pinned base-art snapshot.
  keepSnapshot: z.boolean().optional(),
  // Only an explicit Save Appearance may clear all equipped clothing.
  clearClothing: z.boolean().optional(),
  topTucked: z.boolean().optional(),
  expectedRevision: z.number().int().min(0),
}).strict();

/** A revision-checked independent tuck toggle, saved without changing clothes. */
export const savePlayerAvatarTuckSchema = z.object({
  expectedRevision: z.number().int().min(0),
  topTucked: z.boolean(),
}).strict();

export const savePlayerAvatarEquipmentSchema = z.object({
  expectedRevision: z.number().int().min(0),
  inventoryId: z.string().uuid().nullable(),
  // Optional for compatibility with older players and equipment requests.
  colorTint: playerSkinToneSchema.optional(),
}).strict();

export { playerClothingCategorySchema };

/** Avoid treating a catalog item, a pet adornment, or listed/revoked stock
 * as wearable merely because the client knows its shopItemId. */
export function isEligiblePlayerClothingInventory(input: {
  ownerId: string;
  playerId: string;
  itemType: string;
  quantity: number;
  isListed: boolean;
  itemCategory: string;
  requestedCategory: string;
  designBaseId: string;
  selectedBaseId: string;
  designBasePublishedAt: Date;
  selectedBasePublishedAt: Date;
  publishedSegmentsCount: number;
  universal?: boolean;
}): boolean {
  return input.ownerId === input.playerId &&
    input.itemType === "clothing" &&
    Number.isInteger(input.quantity) && input.quantity > 0 &&
    !input.isListed &&
    input.itemCategory === input.requestedCategory &&
    (input.universal === true || (
      input.designBaseId === input.selectedBaseId &&
      input.designBasePublishedAt.getTime() === input.selectedBasePublishedAt.getTime()
    )) &&
    input.publishedSegmentsCount > 0;
}
