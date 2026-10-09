/**
 * Device-independent artwork geometry.
 *
 * This is a pure coordinate converter, not a second placement editor or a
 * replacement for any existing saved admin positions. Every foreground object
 * and its background must use the SAME returned transform.
 */
export type ArtworkSize = Readonly<{ width: number; height: number }>;
export type ArtworkPoint = Readonly<{ x: number; y: number }>;
export type ArtworkRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type ArtworkFit = "contain" | "cover";
export type ArtworkTransform = Readonly<{
  scale: number;
  left: number;
  top: number;
  renderedWidth: number;
  renderedHeight: number;
  artwork: ArtworkSize;
  viewport: ArtworkSize;
}>;

function validSize(size: ArtworkSize, label: string): void {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new RangeError(`${label} dimensions must be finite positive numbers`);
  }
}

/** Maps original artwork pixels to the displayed viewport, including cropping or letterboxing. */
export function calculateArtworkTransform(
  artwork: ArtworkSize,
  viewport: ArtworkSize,
  fit: ArtworkFit = "contain",
): ArtworkTransform {
  validSize(artwork, "Artwork");
  validSize(viewport, "Viewport");
  const scale = fit === "cover"
    ? Math.max(viewport.width / artwork.width, viewport.height / artwork.height)
    : Math.min(viewport.width / artwork.width, viewport.height / artwork.height);
  const renderedWidth = artwork.width * scale;
  const renderedHeight = artwork.height * scale;
  return {
    scale,
    left: (viewport.width - renderedWidth) / 2,
    top: (viewport.height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
    artwork: { ...artwork },
    viewport: { ...viewport },
  };
}

/** Existing percentage-based placements can be used without changing saved values. */
export function artworkPercentToPoint(placement: ArtworkPoint, artwork: ArtworkSize): ArtworkPoint {
  validSize(artwork, "Artwork");
  return { x: placement.x / 100 * artwork.width, y: placement.y / 100 * artwork.height };
}

export function artworkPointToPercent(point: ArtworkPoint, artwork: ArtworkSize): ArtworkPoint {
  validSize(artwork, "Artwork");
  return { x: point.x / artwork.width * 100, y: point.y / artwork.height * 100 };
}

export function artworkPointToScreen(point: ArtworkPoint, transform: ArtworkTransform): ArtworkPoint {
  return { x: transform.left + point.x * transform.scale, y: transform.top + point.y * transform.scale };
}

export function screenPointToArtwork(point: ArtworkPoint, transform: ArtworkTransform): ArtworkPoint {
  return { x: (point.x - transform.left) / transform.scale, y: (point.y - transform.top) / transform.scale };
}

export function artworkRectToScreen(rect: ArtworkRect, transform: ArtworkTransform): ArtworkRect {
  const origin = artworkPointToScreen(rect, transform);
  return { ...origin, width: rect.width * transform.scale, height: rect.height * transform.scale };
}

/**
 * Map an existing saved percent offset to screen pixels, measured from the
 * displayed artwork's top-left rather than from the phone's viewport.
 */
export function artworkPercentToScreen(placement: ArtworkPoint, transform: ArtworkTransform): ArtworkPoint {
  return artworkPointToScreen(artworkPercentToPoint(placement, transform.artwork), transform);
}

export function screenPointToArtworkPercent(point: ArtworkPoint, transform: ArtworkTransform): ArtworkPoint {
  return artworkPointToPercent(screenPointToArtwork(point, transform), transform.artwork);
}

/**
 * Convert a pointer movement into a saved artwork-percent offset.
 * Uses the actual displayed artwork transform, including crop/letterbox
 * offsets, rather than a hardcoded phone width or height.
 */
export function dragArtworkPercentOffset<T extends ArtworkPoint>(
  saved: T,
  pointerStart: ArtworkPoint,
  pointerEnd: ArtworkPoint,
  transform: ArtworkTransform,
  clamp = 100,
): T {
  const start = screenPointToArtworkPercent(pointerStart, transform);
  const end = screenPointToArtworkPercent(pointerEnd, transform);
  return {
    ...saved,
    x: Math.max(-clamp, Math.min(clamp, saved.x + end.x - start.x)),
    y: Math.max(-clamp, Math.min(clamp, saved.y + end.y - start.y)),
  };
}
