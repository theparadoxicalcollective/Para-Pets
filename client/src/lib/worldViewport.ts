const WORLD_MAP_WIDTH = 1080;

/** Select only the map artwork fit; the surrounding game stage stays native. */
export function calculateWorldFitScale(
  frameWidth: number,
  frameHeight: number,
  mapHeight: number,
  fitFullComposition: boolean,
): number {
  const widthScale = frameWidth / WORLD_MAP_WIDTH;
  const heightScale = frameHeight / mapHeight;
  return fitFullComposition ? Math.min(widthScale, heightScale) : Math.max(widthScale, heightScale);
}
