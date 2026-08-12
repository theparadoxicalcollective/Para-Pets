const WORLD_MAP_WIDTH = 1080;

/**
 * Fit world artwork consistently across normal mobile browsers and installed
 * web-app mode. Browser chrome must not switch worlds into a letterboxed
 * "contain" presentation, because that creates a large empty band above the
 * map and makes the world appear vertically displaced compared with the PWA.
 *
 * Keep the legacy fourth argument for call-site compatibility while the world
 * page owns its viewport lifecycle; the fit itself is intentionally always
 * cover.
 */
export function calculateWorldFitScale(
  frameWidth: number,
  frameHeight: number,
  mapHeight: number,
  _fitFullComposition: boolean,
): number {
  const widthScale = frameWidth / WORLD_MAP_WIDTH;
  const heightScale = frameHeight / mapHeight;
  return Math.max(widthScale, heightScale);
}
