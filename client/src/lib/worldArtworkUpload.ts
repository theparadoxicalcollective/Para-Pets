import {
  WORLD_ARTWORK_ACCEPT, WORLD_ARTWORK_MAX_BASE64, WORLD_ARTWORK_TARGET_BYTES,
  worldArtworkError,
} from "@shared/worlds/worldSceneContent";
import { readPetParkImageData } from "./petParkImageData";

/**
 * Only large world artwork needs browser preparation. Keep original pixels for
 * normal uploads, preserve alpha, and never flatten animated GIFs.
 * Use the same maximum dimensions as the server's existing image processor.
 */
export async function readWorldArtwork(file: File, maxSize: 2000 | 2400 = 2000): Promise<string> {
  if (!WORLD_ARTWORK_ACCEPT.split(",").includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, WebP or GIF image.");
  }
  if (!file.size) throw new Error("This artwork file is empty.");
  const maxBytes = Math.floor(WORLD_ARTWORK_MAX_BASE64 / 4) * 3;
  let artwork: Blob = file;
  // Avoid decoding animated artwork in a canvas. Its original animation is
  // processed by the server, subject to the regular upload limit.
  if (file.size > WORLD_ARTWORK_TARGET_BYTES && file.type !== "image/gif") {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not prepare artwork.");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const encode = (type: string, quality?: number) => new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, type, quality));
      // PNG retains transparency and detail. Prefer it for transparent artwork,
      // falling back to high-quality WebP only if it substantially reduces size.
      const primary = await encode(file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.97);
      if (primary) artwork = primary.size < file.size || scale < 1 ? primary : file;
      if (artwork.size > WORLD_ARTWORK_TARGET_BYTES) {
        const webp = await encode("image/webp", 0.97);
        if (webp?.type === "image/webp" && webp.size < artwork.size) artwork = webp;
      }
      canvas.width = canvas.height = 0;
    } catch {
      // If this browser cannot optimize a valid original, let the existing
      // server processor handle it rather than rejecting a usable image.
      artwork = file;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (artwork.size > maxBytes) {
    throw new Error("Artwork is too large to upload (maximum 22.5 MiB per image after preparation).");
  }
  const data = await readPetParkImageData(new File([artwork], file.name, { type: artwork.type }));
  const error = worldArtworkError(data);
  if (error) throw new Error(error === "size" ? "Artwork is too large to upload." : "The artwork format could not be read.");
  return data;
}
