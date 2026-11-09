import { z } from "zod";
import {
  playerCharacterPartTypeSchema,
  playerCharacterTransformSchema,
  type PlayerCharacterPart,
} from "./playerCharacter";
import {
  playerClothingCategorySchema,
  playerClothingDefinitionSchema,
  playerClothingRenderPlaneSchema,
  playerClothingSegmentSchema,
  type PlayerClothingCategory,
  type PlayerClothingSegment,
} from "./playerCharacterClothing";

/** Catalog items are only created when a complete design is explicitly
 * published. No client can create, purchase or equip clothing in 08A. */
export const AVATAR_CLOTHING_UNRELEASED_WORLD = "__avatar_clothing_unreleased__";

const uploadData = z.string().max(8_000_000)
  .regex(/^data:image\/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);

export const createClothingDraftSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: playerClothingCategorySchema,
  baseId: z.string().uuid(),
}).strict();

export const updateClothingDraftSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: playerClothingCategorySchema,
  expectedRevision: z.number().int().min(0),
}).strict();

export const clothingSegmentWriteSchema = z.object({
  expectedRevision: z.number().int().min(0),
  fit: playerCharacterTransformSchema,
  renderPlane: playerClothingRenderPlaneSchema,
  imageData: uploadData.optional(),
}).strict();

export const clothingRevisionSchema = z.object({
  expectedRevision: z.number().int().min(0),
}).strict();

export interface PlayerClothingDraft {
  id: string;
  baseId: string;
  basePublishedAt: Date;
  name: string;
  category: PlayerClothingCategory;
  draftSegments: PlayerClothingSegment[];
  publishedSegments: PlayerClothingSegment[] | null;
  shopItemId: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

/** Keep a single fitted image per animation anchor in a clothing item.
 * A named pants item may own both the left and right leg. */
export function upsertClothingSegment(
  segments: readonly PlayerClothingSegment[],
  next: PlayerClothingSegment,
): PlayerClothingSegment[] {
  const validated = playerClothingSegmentSchema.parse(next);
  const result = [...segments.filter(item => item.partType !== validated.partType), validated];
  playerClothingDefinitionSchema.parse({ name: "draft", category: "top", segments: result });
  return result;
}

export function validClothingPublication(
  name: string,
  category: PlayerClothingCategory,
  segments: readonly PlayerClothingSegment[],
): boolean {
  return playerClothingDefinitionSchema.safeParse({ name, category, segments }).success;
}

/** Editor and renderer share a base-relative, part-local contract. */
export function clothingPartIsAvailable(
  parts: readonly PlayerCharacterPart[],
  partType: z.infer<typeof playerCharacterPartTypeSchema>,
): boolean {
  return parts.some(part => part.partType === partType);
}
