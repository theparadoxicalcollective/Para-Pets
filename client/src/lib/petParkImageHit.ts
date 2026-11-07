import { getAlphaBoundsSync, type AlphaBounds } from "./alphaBounds";

/** Low-resolution alpha sampling is cached per artwork URL. This is only used
 * for admin pointer-down hit testing, never in animation or rendering loops.
 * If canvas readback is blocked, use existing visible alpha bounds instead.
 */
const MASK_SIZE = 96;
const ALPHA_THRESHOLD = 12;
const cached = new Map<string, Uint8ClampedArray | null>();

export function parkImageHitAt(
  image: HTMLImageElement, clientX: number, clientY: number, flipped = false,
): boolean {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return false;
  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  let x = (clientX - rect.left - (rect.width - width) / 2) / width;
  const y = (clientY - rect.top - (rect.height - height) / 2) / height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  if (flipped) x = 1 - x;

  const url = image.currentSrc || image.src;
  if (!cached.has(url)) {
    let alpha: Uint8ClampedArray | null = null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = MASK_SIZE;
      canvas.height = MASK_SIZE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(image, 0, 0, MASK_SIZE, MASK_SIZE);
        const rgba = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
        alpha = new Uint8ClampedArray(MASK_SIZE * MASK_SIZE);
        for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
      }
    } catch { /* CORS-restricted assets fall back to cached alpha bounds. */ }
    if (cached.size >= 128) cached.delete(cached.keys().next().value!);
    cached.set(url, alpha);
  }
  const mask = cached.get(url);
  if (mask) {
    const pixelX = Math.min(MASK_SIZE - 1, Math.floor(x * MASK_SIZE));
    const pixelY = Math.min(MASK_SIZE - 1, Math.floor(y * MASK_SIZE));
    return mask[pixelY * MASK_SIZE + pixelX] > ALPHA_THRESHOLD;
  }
  const bounds = getAlphaBoundsSync(url);
  return !bounds || (x >= bounds.left && y >= bounds.top &&
    x <= bounds.left + bounds.width && y <= bounds.top + bounds.height);
}

/**
 * Shrink a player hit target to the visible artwork, including object-contain
 * letterboxing. CSS clip-path affects actual pointer targeting, unlike an
 * alpha check performed after the topmost button has already caught a click.
 * Reuse the same alpha bounds that the park's depth/contact calculation reads.
 * The visual art and saved positioning do not change.
 */
export function parkImageHitClipPath(
  bounds: AlphaBounds | null | undefined,
  naturalWidth: number,
  naturalHeight: number,
): string | undefined {
  if (!bounds || naturalWidth <= 0 || naturalHeight <= 0) return undefined;
  const fit = Math.max(naturalWidth, naturalHeight);
  const width = naturalWidth / fit, height = naturalHeight / fit;
  const padX = (1 - width) / 2, padY = (1 - height) / 2;
  const margin = 0.012; // avoid shaving antialiased edges on high-DPI phones
  const left = Math.max(0, padX + bounds.left * width - margin);
  const top = Math.max(0, padY + bounds.top * height - margin);
  const right = Math.max(0, 1 - padX - (bounds.left + bounds.width) * width - margin);
  const bottom = Math.max(0, 1 - padY - (bounds.top + bounds.height) * height - margin);
  return `inset(${top * 100}% ${right * 100}% ${bottom * 100}% ${left * 100}%)`;
}
