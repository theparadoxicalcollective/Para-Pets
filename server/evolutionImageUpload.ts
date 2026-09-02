/** undefined preserves existing artwork; null explicitly removes it. */
export async function processEvolutionImageUpdate(
  input: { evolutionImageData?: unknown; evolutionImageUrl?: unknown },
  itemType: string,
  processImage: (data: string) => Promise<string>,
): Promise<string | null | undefined> {
  if (input.evolutionImageUrl !== undefined && input.evolutionImageUrl !== null) {
    throw new Error("Upload an evolution image instead of supplying an image URL.");
  }
  if (input.evolutionImageData === undefined) return input.evolutionImageUrl as null | undefined;
  if (itemType !== "pet") throw new Error("Evolution images are only available for pets.");
  const data = input.evolutionImageData;
  if (typeof data !== "string" || !data.startsWith("data:image/png;base64,")) {
    throw new Error("Evolution image must be a PNG file.");
  }
  const encoded = data.slice("data:image/png;base64,".length);
  if (encoded.length > Math.ceil(20 * 1024 * 1024 / 3) * 4) {
    throw new Error("Evolution image must be 20MB or smaller.");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > 20 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Evolution image must be a valid PNG file.");
  }
  // The existing image pipeline decodes, bounds dimensions, re-encodes as a
  // still PNG, and stores a server-owned media URL. Never persist the data URL.
  return processImage(data);
}
