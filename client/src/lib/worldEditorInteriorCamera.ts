import { worldEditorClampCamera } from "./worldEditorCamera";

type Size = { width: number; height: number };

/** Match the expanded Pet Park room: artwork owns the entire visible height
 * and keeps its native aspect ratio. Only its horizontal scroll position can
 * change. Wide rooms never expose space beyond their edges; narrower artwork
 * is centered rather than stretched or cropped vertically. */
export function worldEditorInteriorCamera(viewport: Size, aspect: number, centerX = .5) {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3;
  const height = Math.max(1, viewport.height);
  const width = height * ratio;
  const center = Number.isFinite(centerX) ? centerX : .5;
  const pan = worldEditorClampCamera({
    x: viewport.width / 2 - center * width,
    y: 0,
  }, {
    sceneWidth: width, sceneHeight: height,
    limitX: Math.max(0, width - viewport.width), limitY: 0,
  }, viewport);
  return { width, height, pan: { x: pan.x, y: 0 },
    center: { x: interiorCameraCenterX(viewport.width, width, pan.x), y: .5 } };
}

/** Preserve the artwork point at viewport center across device resizing. */
export function interiorCameraCenterX(viewportWidth: number, artworkWidth: number, panX: number): number {
  return Math.max(0, Math.min(1, (viewportWidth / 2 - panX) / Math.max(1, artworkWidth)));
}
