import { worldEditorClampCamera } from "./worldEditorCamera";

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/** Room zoom is independent of outdoor terrain. A zero zoom is the room
 * overview; 1 fills the screen height, like Pet Park's expanded room. */
export function worldEditorInteriorCamera(viewport: Size, aspect: number, zoom: number, center: Point) {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3;
  const height = zoom === 0
    ? Math.min(viewport.height, viewport.width / ratio)
    : viewport.height * zoom;
  const width = height * ratio;
  const bounds = {
    sceneWidth: width, sceneHeight: height,
    limitX: Math.max(0, width - viewport.width), limitY: Math.max(0, height - viewport.height),
  };
  const pan = worldEditorClampCamera({
    x: viewport.width / 2 - center.x * width,
    y: viewport.height / 2 - center.y * height,
  }, bounds, viewport);
  // In edit mode allow a little vertical travel beyond the physical edges,
  // so artwork under the fixed top/bottom toolbars can be brought into view.
  // The default centered view still fills the viewport; Fit remains contained.
  if (zoom !== 0) {
    const topClearance = Math.min(112, viewport.height * .18);
    const bottomClearance = Math.min(250, viewport.height * .33);
    pan.y = Math.max(viewport.height - height - bottomClearance,
      Math.min(topClearance, viewport.height / 2 - center.y * height));
  }
  return { width, height, pan, center: interiorCameraCenter(viewport, { width, height }, pan) };
}

/** Store the visible center in authored image coordinates, not screen pixels.
 * This keeps the same area in view on device resize or room-only zoom. */
export function interiorCameraCenter(viewport: Size, artwork: Size, pan: Point): Point {
  return {
    x: Math.max(0, Math.min(1, (viewport.width / 2 - pan.x) / Math.max(1, artwork.width))),
    y: Math.max(0, Math.min(1, (viewport.height / 2 - pan.y) / Math.max(1, artwork.height))),
  };
}
