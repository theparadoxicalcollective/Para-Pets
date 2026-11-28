import { getAlphaBoundsSync, type AlphaBounds } from "./alphaBounds";

/** Low-resolution alpha sampling is cached per artwork URL. This is only used
 * for admin pointer-down hit testing and player barrier masks prepared on
 * artwork load. Never read back a canvas in the walking animation frame.
 * If canvas readback is blocked, use existing visible alpha bounds instead.
 */
const MASK_SIZE = 96;
const ALPHA_THRESHOLD = 12;
const cached = new Map<string, Uint8ClampedArray | null>();

export function parkImageHitAt(
  image: HTMLImageElement, clientX: number, clientY: number, flipped = false, rotation = 0,
): boolean {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return false;
  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  // World artwork is rotated around its square center, after mirroring.
  // Unrotate the pointer and recover the unrotated square from its bounding
  // box before applying object-contain and the existing alpha mask.
  const radians = rotation * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const extent = Math.abs(cos) + Math.abs(sin);
  const boxWidth = rect.width / extent, boxHeight = rect.height / extent;
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  const scale = Math.min(boxWidth / image.naturalWidth, boxHeight / image.naturalHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  let x = (dx * cos + dy * sin) / width + 0.5;
  const y = (-dx * sin + dy * cos) / height + 0.5;
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  if (flipped) x = 1 - x;

  return parkImageAlphaSampler(image)(x, y);
}

/** Sample the object-contain square without reading DOM geometry. The mask is
 * prepared on artwork load, never by the walking frame. */
export function parkSquareArtworkSampler(image: HTMLImageElement): (x: number, y: number) => boolean {
  const fit = Math.max(1, image.naturalWidth, image.naturalHeight);
  const width = image.naturalWidth / fit, height = image.naturalHeight / fit;
  if (!width || !height) return () => true;
  const sample = parkImageAlphaSampler(image);
  return (x, y) => {
    const u = (x - .5) / width + .5, v = (y - .5) / height + .5;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 && sample(u, v);
  };
}

function parkImageAlphaSampler(image: HTMLImageElement): (x: number, y: number) => boolean {
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
    return (x, y) => {
      const pixelX = Math.min(MASK_SIZE - 1, Math.floor(x * MASK_SIZE));
      const pixelY = Math.min(MASK_SIZE - 1, Math.floor(y * MASK_SIZE));
      return mask[pixelY * MASK_SIZE + pixelX] > ALPHA_THRESHOLD;
    };
  }
  const bounds = getAlphaBoundsSync(url);
  return (x, y) => !bounds || (x >= bounds.left && y >= bounds.top &&
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

/** Center affordances over the *visible* pixels, not transparent PNG padding. */
export function parkImageVisualCenter(
  bounds: AlphaBounds | null | undefined,
  naturalWidth: number,
  naturalHeight: number,
): { xPct: number; yPct: number } {
  if (!bounds || naturalWidth <= 0 || naturalHeight <= 0) return { xPct: 50, yPct: 50 };
  const fit = Math.max(naturalWidth, naturalHeight);
  const width = naturalWidth / fit, height = naturalHeight / fit;
  return {
    xPct: 100 * ((1 - width) / 2 + (bounds.left + bounds.width / 2) * width),
    yPct: 100 * ((1 - height) / 2 + (bounds.top + bounds.height / 2) * height),
  };
}
