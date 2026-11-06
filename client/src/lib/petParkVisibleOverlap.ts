import { getAlphaBoundsSync } from "./alphaBounds";

export type ParkPixelRect = { left: number; top: number; right: number; bottom: number };
type Size = { width: number; height: number };
type Position = { x: number; y: number };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

/** Inspect actual, already-mounted art when a drop ends; no image rescans,
 * animation-frame checks, transparent-box collision, or extra server state.
 * PetAnimator part images have cached alpha bounds; simple PNG pets use the
 * same cache when available. Missing bounds use a conservative inner region.
 */
export function parkVisiblePetArtworkBounds(petElement: HTMLElement): ParkPixelRect {
  const artwork = petElement.querySelector<HTMLElement>("[data-park-pet-artwork]") ?? petElement;
  const frame = artwork.getBoundingClientRect();
  const fallback: ParkPixelRect = {
    left: frame.left + frame.width * 0.17,
    right: frame.right - frame.width * 0.17,
    top: frame.top + frame.height * 0.08,
    bottom: frame.bottom - frame.height * 0.1,
  };
  if (!frame.width || !frame.height) return fallback;
  const images = Array.from(artwork.querySelectorAll<HTMLImageElement>("img"));
  let union: ParkPixelRect | null = null;
  for (const image of images) {
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) continue;
    const box = image.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    const fit = getComputedStyle(image).objectFit;
    const scale = fit === "contain" ? Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight) : null;
    const drawnWidth = scale ? image.naturalWidth * scale : box.width;
    const drawnHeight = scale ? image.naturalHeight * scale : box.height;
    const offsetX = box.left + (box.width - drawnWidth) / 2;
    const offsetY = box.top + (box.height - drawnHeight) / 2;
    const alpha = getAlphaBoundsSync(image.currentSrc || image.src);
    // Never count an entire transparent PNG as visible while its alpha scan
    // is pending. The image's center is a useful, low-cost initial fallback.
    const crop = alpha ?? { left: .16, top: .12, width: .68, height: .76 };
    const visible: ParkPixelRect = {
      left: offsetX + drawnWidth * crop.left,
      top: offsetY + drawnHeight * crop.top,
      right: offsetX + drawnWidth * (crop.left + crop.width),
      bottom: offsetY + drawnHeight * (crop.top + crop.height),
    };
    // Ignore off-frame graphic elements, but permit ears and wing tips.
    const margin = frame.width * .22;
    const marginY = frame.height * .22;
    if (visible.right < frame.left - margin || visible.left > frame.right + margin ||
        visible.bottom < frame.top - marginY || visible.top > frame.bottom + marginY) continue;
    union = union ? {
      left: Math.min(union.left, visible.left), top: Math.min(union.top, visible.top),
      right: Math.max(union.right, visible.right), bottom: Math.max(union.bottom, visible.bottom),
    } : visible;
  }
  if (!union) return fallback;
  return {
    left: clamp(union.left, frame.left - frame.width * .15, frame.right),
    right: clamp(union.right, frame.left, frame.right + frame.width * .15),
    top: clamp(union.top, frame.top - frame.height * .15, frame.bottom),
    bottom: clamp(union.bottom, frame.top, frame.bottom + frame.height * .15),
  };
}

/** The saved point is the pet's centered ground anchor, not its transparent
 * sprite-box top-left. Translate a measured visible union to the new anchor,
 * including size changes when entering/leaving an admin sleep square.
 */
export function parkProjectedIndoorPetBounds(
  position: Position,
  size: number,
  artwork: ParkPixelRect,
  source?: { element: HTMLElement; currentSize: number } | null,
): ParkPixelRect {
  const targetX = artwork.left + position.x * (artwork.right - artwork.left);
  const targetY = artwork.top + position.y * (artwork.bottom - artwork.top);
  if (source && source.currentSize > 0) {
    const rect = source.element.getBoundingClientRect();
    const visible = parkVisiblePetArtworkBounds(source.element);
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height * .88;
    const ratio = size / source.currentSize;
    return {
      left: targetX + (visible.left - originX) * ratio,
      right: targetX + (visible.right - originX) * ratio,
      top: targetY + (visible.top - originY) * ratio,
      bottom: targetY + (visible.bottom - originY) * ratio,
    };
  }
  // The first move from the equipped tray has no in-room art to measure yet.
  // Use the center portion of the future visible pet, never the padded square.
  return {
    left: targetX - size * .34, right: targetX + size * .34,
    top: targetY - size * .80, bottom: targetY - size * .12,
  };
}

/** Let sprites brush past one another, but avoid covering nearly all of the
 * smaller visible pet; otherwise a player might not be able to pick it up.
 */
export function parkPetWouldObscureAnother(a: ParkPixelRect, b: ParkPixelRect): boolean {
  const intersectionWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const intersectionHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const areaA = Math.max(0, a.right - a.left) * Math.max(0, a.bottom - a.top);
  const areaB = Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
  const smaller = Math.min(areaA, areaB);
  return smaller > 0 && intersectionWidth * intersectionHeight / smaller > .72;
}

export function parkInteriorArtworkRect(element: HTMLElement): ParkPixelRect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}
