import { parkTerrainHeightRatio } from "@shared/petParkTerrainDetails";
/**
 * Limit the DOM for individually saved terrain stamps to the camera's visible
 * viewport. Stamps retain their exact saved normalized world coordinates:
 * this only decides whether to render the existing PetParkTerrainDetail.
 */
export type ParkTerrainStamp = { xPct: number; yPct: number; size: number; effectType?: string | null };
export type ParkTerrainScreen = { width: number; height: number };
export type ParkTerrainScene = { width: number; height: number; scale: number };
export type ParkTerrainCamera = { x: number; y: number };

export function isParkTerrainNearViewport(
  stamp: ParkTerrainStamp,
  viewport: ParkTerrainScreen,
  scene: ParkTerrainScene,
  camera: ParkTerrainCamera,
  overscan = 96,
): boolean {
  const centerX = stamp.xPct * scene.width + camera.x;
  const centerY = stamp.yPct * scene.height + camera.y;
  // Match the existing PetParkPage terrain artwork: width=size*scale,
  // height=size*scale*parkTerrainHeightRatio(type), both centered with translate(-50%, -50%).
  const radiusX = stamp.size * scene.scale / 2;
  const radiusY = stamp.size * scene.scale * parkTerrainHeightRatio(stamp.effectType) / 2;
  return centerX + radiusX >= -overscan &&
    centerX - radiusX <= viewport.width + overscan &&
    centerY + radiusY >= -overscan &&
    centerY - radiusY <= viewport.height + overscan;
}
