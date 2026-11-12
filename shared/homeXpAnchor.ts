/** Home XP placement remains relative to intrinsic background artwork.
 * The optional depth upgrades previously saved admin placements in place. */
export const HOME_XP_DEFAULT_CURVE = 145;
export const HOME_XP_MIN_CURVE = 105;
export const HOME_XP_MAX_CURVE = 220;
export interface HomeXpAnchor { xPct: number; yPct: number; curveDepth?: number }

export function isHomeXpAnchor(value: unknown): value is HomeXpAnchor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const anchor = value as Record<string, unknown>;
  return typeof anchor.xPct === "number" && Number.isFinite(anchor.xPct) &&
    anchor.xPct >= 0 && anchor.xPct <= 1 &&
    typeof anchor.yPct === "number" && Number.isFinite(anchor.yPct) &&
    anchor.yPct >= 0 && anchor.yPct <= 1 &&
    (anchor.curveDepth === undefined ||
      (typeof anchor.curveDepth === "number" && Number.isFinite(anchor.curveDepth) &&
        anchor.curveDepth >= HOME_XP_MIN_CURVE && anchor.curveDepth <= HOME_XP_MAX_CURVE));
}

/** Smooth rounded U: the empty groove, illuminated rim and earned fill all
 * share the same cubic path. Keep the level label following its lower rim. */
export function homeXpArcGeometry(curveDepth = HOME_XP_DEFAULT_CURVE) {
  const depth = Math.max(HOME_XP_MIN_CURVE, Math.min(HOME_XP_MAX_CURVE, curveDepth));
  const center = (14 + depth * 3) / 4;
  const levelY = center + 38;
  return {
    path: `M 12 14 C 76 ${depth} 244 ${depth} 308 14`,
    levelPath: `M 100 ${levelY} Q 160 ${levelY + 16} 220 ${levelY}`,
    viewHeight: Math.ceil(center + 79),
  };
}
