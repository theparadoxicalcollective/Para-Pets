/**
 * Device-independent coordinate contracts.
 *
 * SCENE: authored items are stored as percentages of their background plane.
 * HUD: controls are anchored to the visible device rectangle.
 * POPUP: dialog placement is centered on the visible device rectangle.
 *
 * These pure helpers do not change legacy stage ownership or persisted data.
 * Pages can migrate individually after regression testing.
 */
export type CoordinatePoint = { x: number; y: number };
export type CoordinateRect = { left: number; top: number; width: number; height: number };
export type ScenePlacement = { xPct: number; yPct: number };
export type HudCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Saved scene positions belong to the image, not the screen or camera. */
export function scenePointToPlacement(point: CoordinatePoint, scene: CoordinateRect): ScenePlacement | null {
  if (scene.width <= 0 || scene.height <= 0) return null;
  return {
    xPct: clamp01((point.x - scene.left) / scene.width),
    yPct: clamp01((point.y - scene.top) / scene.height),
  };
}

export function scenePlacementToPoint(placement: ScenePlacement, scene: CoordinateRect): CoordinatePoint {
  return {
    x: scene.left + placement.xPct * scene.width,
    y: scene.top + placement.yPct * scene.height,
  };
}

/** Screen-fixed controls respect device safe areas, independently of scene pan/zoom. */
export function hudCornerPoint(
  viewport: CoordinateRect,
  corner: HudCorner,
  insets: SafeAreaInsets,
  margin = 0,
): CoordinatePoint {
  return {
    x: viewport.left + (corner.endsWith("left") ? insets.left + margin : viewport.width - insets.right - margin),
    y: viewport.top + (corner.startsWith("top") ? insets.top + margin : viewport.height - insets.bottom - margin),
  };
}

/** Modal centers are computed from the actual visible device, never the authored scene. */
export function popupCenter(viewport: CoordinateRect): CoordinatePoint {
  return { x: viewport.left + viewport.width / 2, y: viewport.top + viewport.height / 2 };
}

/** Fit oversized dialogs inside the usable viewport without changing their preferred size. */
export function popupMaxSize(viewport: CoordinateRect, insets: SafeAreaInsets, margin = 16) {
  return {
    width: Math.max(0, viewport.width - insets.left - insets.right - 2 * margin),
    height: Math.max(0, viewport.height - insets.top - insets.bottom - 2 * margin),
  };
}
