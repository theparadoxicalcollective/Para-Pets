/** Visual depth ordering only: existing normalized placement coordinates are unchanged. */
export type ParkDepthKind = "building" | "item" | "pet";

export type ParkDepthObject = {
  yPct: number;
  worldHeight: number;
  size: number;
  kind: ParkDepthKind;
  layer?: number; // Stored for compatibility only; it never overrides depth.
  contact?: number; // Visible base in the square artwork box, when known.
};

/**
 * World-space visual contact point for the current sprite layouts.
 * Buildings and decor are centered on their saved positions; pets have an
 * existing translateY(-75%) body with an 80% tall animator region.
 * Using those existing transforms avoids jumping any saved artwork.
 */
export function parkGroundContactY({ yPct, worldHeight, size, kind, contact = 1 }: ParkDepthObject): number {
  return yPct * worldHeight + (kind === "pet" ? size * (0.8 - 0.75) : size * (contact - 0.5));
}

/** Nearer ground contacts always cover farther ones. Ignore legacy layers. */
export function parkDepthIndex(object: ParkDepthObject): number {
  return Math.round(5_000_000 + parkGroundContactY(object) * 32);
}

/** Account for transparent padding and object-contain letterboxing. */
export function parkImageGroundContact(width: number, height: number, bounds: { top: number; height: number }): number {
  const drawnHeight = height / Math.max(width, height, 1);
  return (1 - drawnHeight) / 2 + (bounds.top + bounds.height) * drawnHeight;
}
