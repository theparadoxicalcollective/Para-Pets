/** Single shared Home XP bar anchor in intrinsic background-art fractions.
 * Values are independent of the player's viewport, level and pet positions. */
export interface HomeXpAnchor { xPct: number; yPct: number }
export function isHomeXpAnchor(value: unknown): value is HomeXpAnchor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const anchor = value as Record<string, unknown>;
  return typeof anchor.xPct === "number" && Number.isFinite(anchor.xPct) &&
    anchor.xPct >= 0 && anchor.xPct <= 1 &&
    typeof anchor.yPct === "number" && Number.isFinite(anchor.yPct) &&
    anchor.yPct >= 0 && anchor.yPct <= 1;
}
