/**
 * Alpha-bounds helper for pet part rendering.
 *
 * Pet part images are saved with transparent padding around the visible
 * artwork. The artists set `pivotX` / `pivotY` looking at the visible
 * tail / wing / arm — but our renderers were treating those values as
 * percentages of the FULL image bounding box (transparent padding
 * included). Result: a tail with its base at "50 % 100 %" of the
 * visible content but extra empty space below it would actually pivot
 * from a point well below the body, swinging the whole tail away from
 * the pet during the idle wag.
 *
 * This helper scans each part image once on load, finds the tightest
 * rectangle that contains every non-transparent pixel, and exposes it
 * to the renderers so pivot percentages can be re-mapped to the
 * VISIBLE content rather than the padded image. Same image URL → same
 * bounds, so we cache results in a module-level Map.
 *
 * The scan is done at low resolution (64 × 64) for speed; that's
 * plenty of precision for a pivot point that's later expressed as a
 * percentage anyway.
 */

export interface AlphaBounds {
  /** Left edge of visible content, 0..1 of image width. */
  left: number;
  /** Top edge of visible content, 0..1 of image height. */
  top: number;
  /** Width of visible content, 0..1 of image width. */
  width: number;
  /** Height of visible content, 0..1 of image height. */
  height: number;
}

/** The full image — used as a safe fallback when scanning fails. */
export const FULL_BOUNDS: AlphaBounds = { left: 0, top: 0, width: 1, height: 1 };

const cache = new Map<string, AlphaBounds>();
const inflight = new Map<string, Promise<AlphaBounds>>();

const SCAN_SIZE = 64;
/** Below this alpha value a pixel is considered transparent. */
const ALPHA_THRESHOLD = 8;

/**
 * Synchronous accessor — returns previously-cached bounds or null.
 * Renderers that want zero-cost reads on every animation frame should
 * use this and fall back to FULL_BOUNDS until the async scan completes.
 */
export function getAlphaBoundsSync(url: string): AlphaBounds | null {
  return cache.get(url) ?? null;
}

/**
 * Async accessor — kicks off a scan if one isn't already cached or
 * in flight, and resolves with the bounds. Safe to call repeatedly:
 * concurrent calls dedupe on the inflight Map.
 */
export function getAlphaBounds(url: string, srcImg?: HTMLImageElement): Promise<AlphaBounds> {
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;

  // Two-pass scan: try the supplied <img> first (zero extra network),
  // and if that throws (typically a tainted-canvas / CORS error when
  // the visible image was loaded without `crossOrigin="anonymous"`),
  // re-attempt with a fresh CORS-enabled Image. Only cache failures
  // from the SECOND attempt — otherwise a single tainted load would
  // poison the cache permanently and silently revert every part on
  // that URL to the old (wrong) full-bbox pivot for the rest of the
  // session.
  const promise = scan(url, srcImg)
    .catch(() => scan(url, undefined))
    .then(bounds => {
      cache.set(url, bounds);
      inflight.delete(url);
      return bounds;
    })
    .catch(() => {
      cache.set(url, FULL_BOUNDS);
      inflight.delete(url);
      return FULL_BOUNDS;
    });
  inflight.set(url, promise);
  return promise;
}

function scan(url: string, srcImg?: HTMLImageElement): Promise<AlphaBounds> {
  return new Promise((resolve, reject) => {
    const useImg = (img: HTMLImageElement) => {
      try {
        const c = document.createElement("canvas");
        c.width = SCAN_SIZE;
        c.height = SCAN_SIZE;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return reject(new Error("no ctx"));
        ctx.clearRect(0, 0, SCAN_SIZE, SCAN_SIZE);
        ctx.drawImage(img, 0, 0, SCAN_SIZE, SCAN_SIZE);
        const data = ctx.getImageData(0, 0, SCAN_SIZE, SCAN_SIZE).data;
        let minX = SCAN_SIZE, minY = SCAN_SIZE, maxX = -1, maxY = -1;
        for (let y = 0; y < SCAN_SIZE; y++) {
          for (let x = 0; x < SCAN_SIZE; x++) {
            const a = data[(y * SCAN_SIZE + x) * 4 + 3];
            if (a > ALPHA_THRESHOLD) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return resolve(FULL_BOUNDS); // entirely transparent
        // Convert pixel rect → 0..1 normalized. Add half-pixel inset on
        // the right/bottom so we cover the full pixel that contained
        // the last non-transparent sample.
        const left   = minX / SCAN_SIZE;
        const top    = minY / SCAN_SIZE;
        const width  = (maxX - minX + 1) / SCAN_SIZE;
        const height = (maxY - minY + 1) / SCAN_SIZE;
        resolve({ left, top, width, height });
      } catch (err) {
        reject(err);
      }
    };

    if (srcImg && srcImg.complete && srcImg.naturalWidth > 0) {
      useImg(srcImg);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => useImg(img);
    img.onerror = () => reject(new Error("img load failed"));
    img.src = url;
  });
}
