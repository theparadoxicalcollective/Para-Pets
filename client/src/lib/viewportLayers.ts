/**
 * Shared viewport-layer policy for Para Pets.
 *
 * Keep stacking and input ownership in one place so a visual portal cannot
 * accidentally become a full-screen hit target. Gameplay pages own the device
 * viewport; authored world coordinates remain owned by their individual scenes.
 */
export const VIEWPORT_LAYER_Z = {
  backdrop: 0,
  scene: 10,
  page: 20,
  hud: 40,
  modal: 20_000,
} as const;

export type ViewportInputMode = "decorative" | "interactive" | "blocking";

/**
 * Full-surface wrappers only own pointer input when the entire surface is
 * intentionally interactive/blocking. HUD/edge-control wrappers should use
 * decorative ownership and enable pointer events on the actual controls.
 */
export function viewportPointerEvents(mode: ViewportInputMode): "none" | "auto" {
  return mode === "decorative" ? "none" : "auto";
}
