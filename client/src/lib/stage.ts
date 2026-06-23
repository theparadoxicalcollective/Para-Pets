// Cross-device game frame constants + helpers.
//
// The whole game is authored at this fixed "phone" design size and uniformly
// scaled (transform: scale) to fit any device by #game-stage in App.tsx. iPhone
// 12 (390×844) renders at scale 1 — pixel-faithful. The current scale is
// published on <html> as the CSS custom property `--stage-scale`.
export const DESIGN_W = 390;
export const DESIGN_H = 844;

// Reads the live frame scale. Pointer deltas come back from the DOM in rendered
// (scaled) pixels; divide by this to convert them into the design-space pixels
// that map/drag transforms operate in, so dragging feels 1:1 on every device.
export function getStageScale(): number {
  if (typeof document === "undefined") return 1;
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--stage-scale"),
  );
  return v > 0 ? v : 1;
}
