/** Map intrinsic artwork pixels into a center-top CSS background-size: cover backdrop. */
export type ArtworkSize = { width: number; height: number };
export type BackdropRect = { left: number; top: number; width: number; height: number };
export type ArtworkPoint = { x: number; y: number };

export function coverArtworkPoint(artwork: ArtworkSize, backdrop: BackdropRect, point: ArtworkPoint): ArtworkPoint | null {
  const values = [artwork.width, artwork.height, backdrop.width, backdrop.height, backdrop.left, backdrop.top, point.x, point.y];
  if (!values.every(Number.isFinite) || artwork.width <= 0 || artwork.height <= 0 || backdrop.width <= 0 || backdrop.height <= 0) return null;
  const scale = Math.max(backdrop.width / artwork.width, backdrop.height / artwork.height);
  const renderedWidth = artwork.width * scale;
  return {
    x: backdrop.left + (backdrop.width - renderedWidth) / 2 + point.x * scale,
    y: backdrop.top + point.y * scale,
  };
}
