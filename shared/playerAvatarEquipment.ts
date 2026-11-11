import { z } from "zod";
import { playerClothingCategorySchema } from "./playerCharacterClothing";
import { playerSkinToneSchema } from "./playerSkinTone";

/**
 * A published admin base is NOT a created player avatar. Only an explicit
 * authenticated first save creates the per-account record. Rendering Home's
 * "Design Character" prompt can therefore check created === false.
 */
export const createPlayerAvatarSchema = z.object({
  baseId: z.string().uuid(),
  skinTone: playerSkinToneSchema.optional(),
}).strict();

export const changePlayerAvatarBaseSchema = z.object({
  baseId: z.string().uuid(),
  skinTone: playerSkinToneSchema.optional(),
  // Skin-only edits retain the player's pinned base-art snapshot.
  keepSnapshot: z.boolean().optional(),
  // Only an explicit Save Appearance may clear all equipped clothing.
  clearClothing: z.boolean().optional(),
  expectedRevision: z.number().int().min(0),
}).strict();

export const savePlayerAvatarEquipmentSchema = z.object({
  expectedRevision: z.number().int().min(0),
  inventoryId: z.string().uuid().nullable(),
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
