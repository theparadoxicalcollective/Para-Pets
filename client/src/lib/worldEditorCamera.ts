import { parkCameraGeometry, PARK_ZOOM_MAX } from "./petParkCamera";

/** A slightly wider scene view in the World Editor ONLY.
 * The Pet Park camera retains its unchanged 0.6 minimum.
 */
export const WORLD_EDITOR_ZOOM_MIN = 0.5;

/** Prevent blank ground edges even on tall phones or unusually sized tablets. */
export function worldEditorMinZoom(width: number, height: number, groundLevel: number): number {
  const base = parkCameraGeometry(width, height, groundLevel, 1);
  // Scene dimensions at zoom 1 encode current device aspect ratio and the
  // selected ground size. Zooming below this fit ratio exposes blank edges.
  const fit = Math.max(
    Math.max(1, width) / base.sceneWidth,
    Math.max(1, height) / base.sceneHeight,
  );
  return Math.min(PARK_ZOOM_MAX, Math.max(WORLD_EDITOR_ZOOM_MIN, fit * 1.005));
}

export function worldEditorClampZoom(value: number, width: number, height: number, groundLevel: number): number {
  const min = worldEditorMinZoom(width, height, groundLevel);
  return Math.max(min, Math.min(PARK_ZOOM_MAX, Number.isFinite(value) ? value : 1));
}

/** Reuse the exact Pet Park camera geometry and clamps with a World Editor floor. */
export function worldEditorCameraGeometry(width: number, height: number, groundLevel: number, zoom = 1) {
  return parkCameraGeometry(
    width, height, groundLevel,
    worldEditorClampZoom(zoom, width, height, groundLevel),
    1.18, WORLD_EDITOR_ZOOM_MIN,
  );
}
