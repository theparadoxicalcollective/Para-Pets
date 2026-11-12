import { parkCameraGeometry, PARK_ZOOM_MAX } from "./petParkCamera";

/** Only the private World Editor can zoom out to see an entire authored world.
 * Pet Park keeps its own 0.6 floor and camera logic unchanged. */
export const WORLD_EDITOR_ZOOM_MIN = 0.08;

/** Best fit for the WHOLE world, not merely enough to cover the viewport.
 * The surrounding viewport is painted in the same ground palette; it never
 * stretches saved scene geometry or changes authored placement percentages.
 */
export function worldEditorMinZoom(width: number, height: number, groundLevel: number): number {
  const base = parkCameraGeometry(width, height, groundLevel, 1);
  const fit = Math.min(
    Math.max(1, width) / Math.max(1, base.sceneWidth),
    Math.max(1, height) / Math.max(1, base.sceneHeight),
  );
  return Math.min(PARK_ZOOM_MAX, Math.max(WORLD_EDITOR_ZOOM_MIN, fit));
}

export function worldEditorClampZoom(value: number, width: number, height: number, groundLevel: number): number {
  return Math.max(worldEditorMinZoom(width, height, groundLevel),
    Math.min(PARK_ZOOM_MAX, Number.isFinite(value) ? value : 1));
}

/** Reuse Pet Park geometry, but allow the World Editor to show the entire map. */
export function worldEditorCameraGeometry(width: number, height: number, groundLevel: number, zoom = 1) {
  return parkCameraGeometry(width, height, groundLevel,
    worldEditorClampZoom(zoom, width, height, groundLevel),
    1.18, WORLD_EDITOR_ZOOM_MIN);
}

type Viewport = { width: number; height: number };
type WorldCameraBounds = { sceneWidth: number; sceneHeight: number; limitX: number; limitY: number };

/** A scene smaller than the screen is centered (not stuck at the upper left).
 * Otherwise the same hard edges as Pet Park prevent drifting beyond terrain. */
export function worldEditorClampCamera(pan: { x: number; y: number }, bounds: WorldCameraBounds, viewport: Viewport) {
  return {
    x: bounds.sceneWidth <= viewport.width
      ? (viewport.width - bounds.sceneWidth) / 2
      : Math.max(-bounds.limitX, Math.min(0, pan.x)),
    y: bounds.sceneHeight <= viewport.height
      ? (viewport.height - bounds.sceneHeight) / 2
      : Math.max(-bounds.limitY, Math.min(0, pan.y)),
  };
}

/** Preserve the world point beneath the gesture's midpoint while zooming.
 * Unlike parkZoomAnchorPan, a fully zoomed-out scene may center with +pan. */
export function worldEditorZoomAnchorPan(previousPan: { x: number; y: number },
  previousScale: number, nextScale: number, anchor: { x: number; y: number },
  bounds: WorldCameraBounds, viewport: Viewport) {
  const ratio = nextScale / Math.max(0.0001, previousScale);
  return worldEditorClampCamera({
    x: anchor.x - (anchor.x - previousPan.x) * ratio,
    y: anchor.y - (anchor.y - previousPan.y) * ratio,
  }, bounds, viewport);
}
