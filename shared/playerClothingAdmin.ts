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
  playerShoesLayerSchema,
  isFreeClothingSlot,
  clothingSegmentKey,
  type PlayerClothingCategory,
  type PlayerClothingSegment,
  PLAYER_CLOTHING_BODY_TYPES,
  isUniversalClothingCategory,
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
  // Optional so all existing clothing and historic save requests are valid.
  // Only used for the Shoes category; the server validates that boundary.
  shoesLayer: playerShoesLayerSchema.optional(),
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

/** Artwork is uploaded or retained independently for each body under one SKU. */
const clothingBodyUploadSchema = z.object({
  images: z.array(z.object({
    slot: playerClothingSlotSchema,
    partType: playerCharacterPartTypeSchema,
    renderPlane: playerClothingRenderPlaneSchema.optional(),
    imageData: uploadData,
  }).strict()).max(13),
  keep: z.array(z.object({
    previousSlot: playerClothingSlotSchema,
    slot: playerClothingSlotSchema,
    partType: playerCharacterPartTypeSchema,
    renderPlane: playerClothingRenderPlaneSchema.optional(),
  }).strict()).max(13),
}).strict();

function verifyClothingBodyUpload(
  value: z.infer<typeof clothingBodyUploadSchema>, category: PlayerClothingCategory,
  ctx: z.RefinementCtx, path: (string | number)[],
) {
  const seen = new Set<string>();
  for (const entry of [...value.images, ...value.keep]) {
    if (seen.has(entry.slot))
      ctx.addIssue({ code: "custom", path, message: "Each clothing image slot may only be uploaded once per body" });
    seen.add(entry.slot);
    const valid = category === "face"
      ? ["face_open_eyes", "face_closed_eyes", "face_mouth"].includes(entry.slot) && entry.partType === "head"
      : isFreeClothingSlot(entry.slot);
    if (!valid) ctx.addIssue({ code: "custom", path,
      message: "Use Face expression slots or a numbered clothing piece" });
    if (category !== "hair" && entry.renderPlane === "behind_character")
      ctx.addIssue({ code: "custom", path, message: "Only hair may go behind the character" });
  }
  if (category === "face" &&
      !["face_open_eyes", "face_closed_eyes", "face_mouth"].every(slot => seen.has(slot)))
    ctx.addIssue({ code: "custom", path, message: "Each body needs open eyes, closed eyes and mouth" });
  if (!seen.size)
    ctx.addIssue({ code: "custom", path, message: "Upload at least one clothing piece for each body" });
}

/** One Save Clothing request creates or updates a catalog item atomically.
 * Existing artwork is addressed by its previous slot, never a client URL.
 * Historic requests without bodyVariants continue as shared clothing. */
export const saveUniversalClothingItemSchema = z.object({
  id: z.string().uuid().optional(),
  expectedRevision: z.number().int().min(0).optional(),
  name: z.string().trim().min(1).max(80),
  category: playerClothingCategorySchema,
  // Shop prices use the game's existing whole-coin currency.
  price: z.number().int().min(0).max(1_000_000_000).default(0),
  shopImageData: uploadData.optional(),
  images: z.array(z.object({
    slot: playerClothingSlotSchema,
    partType: playerCharacterPartTypeSchema,
    renderPlane: playerClothingRenderPlaneSchema.optional(),
    imageData: uploadData,
  }).strict()).max(13),
  keep: z.array(z.object({
    previousSlot: playerClothingSlotSchema,
    slot: playerClothingSlotSchema,
    partType: playerCharacterPartTypeSchema,
    renderPlane: playerClothingRenderPlaneSchema.optional(),
  }).strict()).max(13),
  shoesLayer: playerShoesLayerSchema.optional(),
  bodyVariants: z.object({
    fem: clothingBodyUploadSchema,
    masc: clothingBodyUploadSchema,
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.bodyVariants && isUniversalClothingCategory(value.category))
    ctx.addIssue({ code: "custom", path: ["bodyVariants"],
      message: "Hair, Faces, Back Accessories and Accessories use one universal upload set" });
  if (value.bodyVariants) {
    let totalBytes = 0;
    for (const kind of PLAYER_CLOTHING_BODY_TYPES) {
      const parts = value.bodyVariants[kind];
      verifyClothingBodyUpload(parts, value.category, ctx, ["bodyVariants", kind]);
      totalBytes += parts.images.reduce((total, item) => total + item.imageData.length, 0);
    }
    if (totalBytes > 40_000_000)
      ctx.addIssue({ code: "custom", path: ["bodyVariants"],
        message: "Combined Fem/Masc artwork exceeds 40 MB" });
  }
  if (!!value.id !== (value.expectedRevision !== undefined))
    ctx.addIssue({ code: "custom", message: "Editing requires an item and revision" });
  const seen = new Set<string>();
  for (const [i, entry] of [...value.images, ...value.keep].entries()) {
    if (seen.has(entry.slot)) ctx.addIssue({ code: "custom", path: [i < value.images.length ? "images" : "keep"],
      message: "Each part needs a unique upload slot" });
    seen.add(entry.slot);
    const isFace = value.category === "face";
    if (isFace ? !["face_open_eyes", "face_closed_eyes", "face_mouth"].includes(entry.slot)
      || entry.partType !== "head" : !isFreeClothingSlot(entry.slot))
      ctx.addIssue({ code: "custom", message: "Use Face expression slots or a numbered clothing piece" });
  }
  if (!value.bodyVariants && value.category === "face" &&
      !["face_open_eyes", "face_closed_eyes", "face_mouth"].every(slot => seen.has(slot))) {
    ctx.addIssue({ code: "custom", path: ["images"], message: "Face needs open eyes, closed eyes and mouth" });
  }
  if (value.category !== "hair" && [...value.images, ...value.keep]
      .some(entry => entry.renderPlane === "behind_character"))
    ctx.addIssue({ code: "custom", message: "Only hair pieces can be layered behind the body" });
  if (value.images.length + value.keep.length > 13)
    ctx.addIssue({ code: "custom", message: "A clothing item supports up to 13 pieces" });
  if (value.category !== "shoes" && value.shoesLayer)
    ctx.addIssue({ code: "custom", message: "Only shoes can choose pants layering" });
  if (!value.bodyVariants && value.images.length + value.keep.length < (value.category === "face" ? 3 : 1))
    ctx.addIssue({ code: "custom", message: "Upload all required clothing artwork" });
  if (value.images.reduce((n, entry) => n + entry.imageData.length, 0) > 40_000_000)
    ctx.addIssue({ code: "custom", message: "Clothing images together exceed 40 MB" });
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
