import { z } from "zod";
import { COSTUME_MAX_PLACEMENT_INSTANCES, type CostumePlacement } from "../shared/costumeFeature";

export class CostumeWingUploadError extends Error {}

const uploadSchema = z.object({
  view: z.enum(["front", "side"]),
  instance: z.number().int().min(1).max(COSTUME_MAX_PLACEMENT_INSTANCES),
  imageData: z.string(),
});

/** Process only the edited fitting's upload; all other views/copies stay intact. */
export async function applyCostumeWingUpload(
  placements: CostumePlacement[], upload: unknown, processImage: (data: string) => Promise<string>,
): Promise<CostumePlacement[]> {
  if (upload === undefined) return placements;
  const parsed = uploadSchema.safeParse(upload);
  if (!parsed.success) throw new CostumeWingUploadError("Invalid mirrored wing upload.");
  const { view, instance, imageData } = parsed.data;
  const target = placements.find(p => p.view === view && (p.instance ?? 1) === instance);
  if (!target || target.anchorPart !== "independent") {
    throw new CostumeWingUploadError("Choose an independent fitting for the mirrored wing image.");
  }
  const prefix = "data:image/png;base64,";
  if (!imageData.startsWith(prefix)) throw new CostumeWingUploadError("Mirrored wing image must be a PNG file.");
  const encoded = imageData.slice(prefix.length);
  const maxBytes = 20 * 1024 * 1024;
  if (encoded.length > Math.ceil(maxBytes / 3) * 4) throw new CostumeWingUploadError("Mirrored wing image must be 20MB or smaller.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > maxBytes || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new CostumeWingUploadError("Mirrored wing image must be a valid PNG file.");
  }
  // The existing media pipeline decodes, resizes and re-encodes the PNG.
  const mirroredWingImageUrl = await processImage(imageData);
  return placements.map(p => p === target ? { ...p, mirroredWingImageUrl } : p);
}
