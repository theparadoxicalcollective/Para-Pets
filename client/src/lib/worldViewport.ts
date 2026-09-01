const WORLD_MAP_WIDTH = 1080;

/**
 * World maps are authored as full-screen compositions. Fit every world by its
 * height so the complete vertical composition stays locked to the viewport
 * instead of using a "cover" scale that zooms/crops tall replacement maps.
 *
 * WorldPage centers the resulting map and clamps movement against the viewport.
 * With mapHeight * scale === frameHeight there is no vertical overflow to pan
 * or scroll through, so players see one fixed-height world composition while
 * admin location coordinates remain percentage-based in the same map space.
 *
 * Keep frameWidth and the legacy fourth argument for call-site compatibility;
 * future replacement maps can use this same behavior without per-world logic.
 */
export function calculateWorldFitScale(
  _frameWidth: number,
  frameHeight: number,
  mapHeight: number,
  _fitFullComposition: boolean,
): number {
  if (!Number.isFinite(frameHeight) || frameHeight <= 0) return 1;
  if (!Number.isFinite(mapHeight) || mapHeight <= 0) return 1;
  return frameHeight / mapHeight;
}
