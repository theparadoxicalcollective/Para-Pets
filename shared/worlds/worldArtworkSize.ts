// Fixed buckets bound the number of generated variants per immutable media ID.
export const WORLD_ARTWORK_SIZES = [256, 512, 768, 1024, 1536, 2048, 2400] as const;
export type WorldArtworkSize = typeof WORLD_ARTWORK_SIZES[number];
export function isWorldArtworkSize(value: number): value is WorldArtworkSize {
  return (WORLD_ARTWORK_SIZES as readonly number[]).includes(value);
}
export function worldArtworkSize(cssSize: number, pixelRatio: number): WorldArtworkSize {
  const pixels = Math.max(1, Number.isFinite(cssSize) ? cssSize : 1) *
    Math.max(1, Math.min(4, Number.isFinite(pixelRatio) ? pixelRatio : 1));
  return WORLD_ARTWORK_SIZES.find(size => size >= pixels) ?? 2400;
}
export const WORLD_MEDIA_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function worldArtworkUrl(url: string, cssSize: number, pixelRatio = 1) {
  const id = url.startsWith("/api/media/") ? url.slice("/api/media/".length) : "";
  return WORLD_MEDIA_ID.test(id) ? `${url}/world-v1/${worldArtworkSize(cssSize, pixelRatio)}` : url;
}
