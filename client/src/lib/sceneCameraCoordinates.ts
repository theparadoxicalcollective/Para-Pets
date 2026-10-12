/** Device-independent pointer conversion for authored scene cameras.
 * The scene's own CSS dimensions are authoritative; a scaled ancestor must
 * never turn client pointer movement into a 390x844 stage movement.
 * Saved world/artwork positions remain unchanged.
 */
export type ScenePointerDelta = Readonly<{ x: number; y: number }>;
export type SceneCameraGeometry = Readonly<{
  clientWidth: number;
  clientHeight: number;
  getBoundingClientRect(): { width: number; height: number };
}>;

export function sceneCameraPointerDelta(
  clientDeltaX: number,
  clientDeltaY: number,
  camera: SceneCameraGeometry | null,
): ScenePointerDelta {
  if (!camera) return { x: 0, y: 0 };
  const rect = camera.getBoundingClientRect();
  const axis = (delta: number, logical: number, rendered: number) =>
    Number.isFinite(delta) && Number.isFinite(logical) && Number.isFinite(rendered)
      && logical > 0 && rendered > 0 ? delta * logical / rendered : 0;
  return {
    x: axis(clientDeltaX, camera.clientWidth, rect.width),
    y: axis(clientDeltaY, camera.clientHeight, rect.height),
  };
}
