import type { Express } from "express";
import sharp from "sharp";
import { isWorldArtworkSize, WORLD_MEDIA_ID, type WorldArtworkSize } from "@shared/worlds/worldArtworkSize";

type Artwork = { mime: string; bytes: Buffer };
type Variant = Artwork & { cacheable: boolean };
type ReadMedia = (id: string) => Promise<Artwork | null>;

/** Responsive copies of immutable world artwork. Never rewrite the source.
 * Preserve animation and unsupported formats instead of flattening them. */
export async function encodeWorldArtwork(original: Artwork, size: WorldArtworkSize): Promise<Variant> {
  try {
    if (!["image/png", "image/jpeg", "image/webp"].includes(original.mime))
      return { ...original, cacheable: true };
    const image = sharp(original.bytes, { limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) > 1 || metadata.format === "gif")
      return { ...original, cacheable: true };
    const bytes = await image.resize(size, size, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 94, alphaQuality: 100, effort: 2 }).toBuffer();
    // Don't send a larger encoding than the source unnecessarily.
    return bytes.length < original.bytes.length || Math.max(metadata.width ?? 0, metadata.height ?? 0) > size
      ? { mime: "image/webp", bytes, cacheable: true }
      : { ...original, cacheable: true };
  } catch {
    // Original delivery remains available even for unusual/corrupt images.
    // Do not permanently cache a failed conversion.
    return { ...original, cacheable: false };
  }
}

export class WorldArtworkBusyError extends Error {}

/** A bounded process-local cache and conversion queue prevent a world with
 * hundreds of unique decorations from monopolizing server CPU or memory.
 * Identical simultaneous requests share both the database read and encoding. */
export function createWorldArtworkService(readMedia: ReadMedia, options: {
  maxBytes?: number; maxEntryBytes?: number; concurrency?: number; maxQueued?: number;
  encode?: typeof encodeWorldArtwork;
} = {}) {
  const { maxBytes = 48 * 1024 * 1024, maxEntryBytes = 4 * 1024 * 1024,
    concurrency = 3, maxQueued = 48, encode = encodeWorldArtwork } = options;
  const cache = new Map<string, Variant>();
  const inFlight = new Map<string, Promise<Variant | null>>();
  const queue: Array<() => void> = [];
  let cachedBytes = 0;
  let active = 0;

  async function acquire() {
    if (active < concurrency) { active++; return; }
    if (queue.length >= maxQueued) throw new WorldArtworkBusyError("World artwork queue is full");
    await new Promise<void>(resolve => queue.push(resolve));
  }
  function release() {
    const next = queue.shift();
    if (next) next();
    else active--;
  }

  async function produce(id: string, size: WorldArtworkSize, key: string) {
    await acquire();
    try {
      const original = await readMedia(id);
      if (!original) return null;
      const variant = await encode(original, size);
      if (variant.cacheable && variant.bytes.length <= Math.min(maxBytes, maxEntryBytes)) {
        while (cachedBytes + variant.bytes.length > maxBytes && cache.size) {
          const oldest = cache.keys().next().value!;
          cachedBytes -= cache.get(oldest)!.bytes.length;
          cache.delete(oldest);
        }
        cache.set(key, variant);
        cachedBytes += variant.bytes.length;
      }
      return variant;
    } finally {
      release();
    }
  }

  function get(id: string, size: WorldArtworkSize): Promise<Variant | null> {
    const key = `${id}:${size}`;
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return Promise.resolve(hit);
    }
    const existing = inFlight.get(key);
    if (existing) return existing;
    const pending = produce(id, size, key).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  }

  return { get };
}

/** The source /api/media/:id is already public and immutable. This versioned
 * route serves only size-bucketed derivatives of the same public blobs. */
export function registerWorldArtworkMediaRoutes(app: Express, readMedia: ReadMedia) {
  const service = createWorldArtworkService(readMedia);
  app.get("/api/media/:id/world-v1/:size", async (req, res) => {
    const { id, size: rawSize } = req.params;
    const size = Number(rawSize);
    if (typeof id !== "string" || !WORLD_MEDIA_ID.test(id) ||
        !isWorldArtworkSize(size) || String(size) !== rawSize) return res.status(404).end();
    try {
      const variant = await service.get(id, size);
      if (!variant) return res.status(404).end();
      res.setHeader("Content-Type", variant.mime);
      res.setHeader("Cache-Control", variant.cacheable ? "public, max-age=31536000, immutable" : "no-store");
      return res.send(variant.bytes);
    } catch (error) {
      res.setHeader("Cache-Control", "no-store");
      if (error instanceof WorldArtworkBusyError) return res.status(503).end();
      console.error("World artwork delivery error:", error);
      return res.status(500).end();
    }
  });
}
