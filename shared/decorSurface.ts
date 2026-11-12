/**
 * A decoration's per-placement traversal and rendering role.
 *
 * Existing unclassified decor is a barrier. Water source remains the existing
 * independent persisted boolean to preserve garden-refill behavior and data.
 * Only one role is presented in the editor at a time.
 */
export const DECOR_SURFACES = ["barrier", "grass", "ground"] as const;
export type DecorSurface = typeof DECOR_SURFACES[number];
export type DecorRole = DecorSurface | "water";

export function isDecorSurface(value: unknown): value is DecorSurface {
  return value === "barrier" || value === "grass" || value === "ground";
}
export function decorRole(item: { isWaterSource?: boolean | null; decorSurface?: DecorSurface | null }): DecorRole {
  return item.isWaterSource ? "water" : (isDecorSurface(item.decorSurface) ? item.decorSurface : "barrier");
}
export function decorRoleUpdate(role: DecorRole): { isWaterSource: boolean; decorSurface: DecorSurface } {
  return { isWaterSource: role === "water", decorSurface: role === "water" ? "barrier" : role };
}
export function decorAllowsWalking(item: { isWaterSource?: boolean | null; decorSurface?: DecorSurface | null }): boolean {
  const role = decorRole(item);
  return role === "grass" || role === "ground";
}

/** All decor roles except Ground use their existing depth behavior. */
export function decorDrawDepth(item: { isWaterSource?: boolean | null; decorSurface?: DecorSurface | null },
  originalDepth: number, groundDepth: number): number {
  return decorRole(item) === "ground" ? groundDepth : originalDepth;
}

/**
 * Collision is ONLY for visible barrier pixels: use the already-cached alpha
 * sampler for both regular and flipped artwork. Water remains non-traversable.
 * This image-space predicate is independent of the viewport/camera transforms
 * and can be used by the actor controller when a scene supports walking.
 */
export function decorBlocksImagePoint(
  item: { isWaterSource?: boolean | null; decorSurface?: DecorSurface | null },
  alphaHit: boolean,
): boolean {
  return !decorAllowsWalking(item) && alphaHit;
}
