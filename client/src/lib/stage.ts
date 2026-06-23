// Cross-device game frame constants + helpers.
//
// The whole game is authored at this fixed "phone" design size and uniformly
// scaled (transform: scale) to fit any device by #game-stage in App.tsx. iPhone
// 12 (390×844) renders at scale 1 — pixel-faithful. The current scale is
// published on <html> as the CSS custom property `--stage-scale`.
export const DESIGN_W = 390;
export const DESIGN_H = 844;

// On larger screens (tablets / desktop) the centered game frame is authored a
// little wider so it doesn't look like a skinny phone stranded in a big window.
// Narrow phone screens (portrait, < WIDE_BREAKPOINT) keep the original 390-wide
// design untouched — they stay pixel-faithful exactly as before.
export const WIDE_DESIGN_W = 430;
export const WIDE_BREAKPOINT = 768;

// The live authored frame width for the current screen. Skinny phones -> 390;
// roomy screens -> WIDE_DESIGN_W. Height is always DESIGN_H so vertical layout
// (and the bottom nav landing point) is unchanged everywhere.
export function getDesignW(): number {
  if (typeof window === "undefined") return DESIGN_W;
  return window.innerWidth >= WIDE_BREAKPOINT ? WIDE_DESIGN_W : DESIGN_W;
}

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
