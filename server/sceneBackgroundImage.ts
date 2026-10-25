import sharp from "sharp";

// A 2× tablet needs substantially more scenery detail than a phone. Bound
// decoded texture size while retaining the source aspect ratio and colours.
export const SCENE_BACKGROUND_MAX_SIZE = 4096;

/** Static scenery only. GIFs retain the existing animated upload path. */
export async function encodeSceneBackground(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .resize(SCENE_BACKGROUND_MAX_SIZE, SCENE_BACKGROUND_MAX_SIZE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ lossless: true, effort: 4 })
    .toBuffer();
}
