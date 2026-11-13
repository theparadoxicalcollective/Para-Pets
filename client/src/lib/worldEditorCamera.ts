import { parkCameraGeometry, PARK_ZOOM_MAX, PARK_ZOOM_MIN } from "./petParkCamera";

/** A scene must cover the visible viewport just as it does in Pet Park.
 * Keep authored coordinates unchanged and reuse its safe zoom floor. */
export const WORLD_EDITOR_ZOOM_MIN = PARK_ZOOM_MIN;

/** "Fit" must COVER both viewport axes, not fit the entire world inside
 * the screen. The previous Math.min left empty margins on the other axis
 * when the world and phone/tablet aspect ratios differed.
 * Keep the Pet Park minimum to avoid a tiny, difficult-to-edit world.
 */
export function worldEditorMinZoom(width: number, height: number, groundLevel: number): number {
  const base = parkCameraGeometry(width, height, groundLevel, 1);
  const cover = Math.max(
    Math.max(1, width) / Math.max(1, base.sceneWidth),
    Math.max(1, height) / Math.max(1, base.sceneHeight),
  );
  return Math.min(PARK_ZOOM_MAX, Math.max(WORLD_EDITOR_ZOOM_MIN, cover));
}

export function worldEditorClampZoom(value: number, width: number, height: number, groundLevel: number): number {
  return Math.max(worldEditorMinZoom(width, height, groundLevel),
    Math.min(PARK_ZOOM_MAX, Number.isFinite(value) ? value : 1));
}

/** Reuse Pet Park geometry and its viewport-cover minimum on all devices. */
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
