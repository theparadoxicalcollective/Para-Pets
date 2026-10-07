export const VIEWPORT_HOST_IDS = {
  backdrop: "game-viewport-backdrop",
  page: "game-viewport-page",
  scene: "game-viewport-scene",
  hud: "game-viewport-hud",
} as const;

export const VIEWPORT_LAYER_Z = {
  backdrop: 10,
  legacyStage: 15,
  page: 20,
  scene: 30,
  hud: 40,
  modal: 20_000,
} as const;

export type ViewportOwner = keyof typeof VIEWPORT_HOST_IDS;

/**
 * Returns a GameStage-owned viewport host when that host exists.
 * Native phone/iPhone-12 ownership intentionally has no expanded hosts.
 */
export function getViewportHost(owner: ViewportOwner): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(VIEWPORT_HOST_IDS[owner]);
}
