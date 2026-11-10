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
  playerClothingSlotSchema,
  clothingSegmentKey,
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

/** One draft revision for all uploaded outfit artwork; no fitting controls.
 * An empty list is allowed when realigning an existing incomplete draft.
 */
export const clothingCanvasWriteSchema = z.object({
  expectedRevision: z.number().int().min(0),
  images: z.array(z.object({
    slot: playerClothingSlotSchema,
    imageData: uploadData,
  }).strict()).max(13),
  removeSlots: z.array(playerClothingSlotSchema).max(13).optional(),
}).strict().superRefine(({ images, removeSlots }, ctx) => {
  const used = new Set<string>();
  for (const [i, item] of images.entries()) {
    if (used.has(item.slot)) ctx.addIssue({
      code: "custom", path: ["images", i, "slot"], message: "Duplicate clothing image",
    });
    used.add(item.slot);
  }
  for (const slot of removeSlots ?? []) {
    if (used.has(slot)) ctx.addIssue({
      code: "custom", path: ["removeSlots"], message: "Cannot upload and remove the same image",
    });
    used.add(slot);
  }
  if (images.reduce((n, image) => n + image.imageData.length, 0) > 40_000_000) {
    ctx.addIssue({ code: "custom", path: ["images"], message: "Combined clothing artwork is too large" });
  }
});

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

/** Keep a single image per upload slot (multiple slots may share a head/arm anchor).
 * A named pants item may own both the left and right leg. */
export function upsertClothingSegment(
  segments: readonly PlayerClothingSegment[],
  next: PlayerClothingSegment,
): PlayerClothingSegment[] {
  const validated = playerClothingSegmentSchema.parse(next);
  const result = [...segments.filter(item => clothingSegmentKey(item) !== clothingSegmentKey(validated)), validated];
  // A segment helper has no category argument. Validate shape and uniqueness
  // here; category-specific slots are verified by the clothing definition on
  // Save Clothing. Treating every draft as "top" rejected Hair/Face artwork.
  z.array(playerClothingSegmentSchema).max(13).parse(result);
  if (new Set(result.map(clothingSegmentKey)).size !== result.length) {
    throw new Error("Each clothing image slot may be used only once");
  }
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
