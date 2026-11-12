/**
 * Colorize a complete composited character surface while retaining the
 * source painting's luminance variation and original alpha.
 *
 * feColorMatrix operates once, AFTER overlapping alpha-composited body parts
 * are flattened by the browser. Coloring each part with an individual
 * translucent mask instead can create double-tinted bands at seams.
 *
 * The artist's light body art has an approximate luminance of 0.82. Normalize
 * by it so a selected dark tone actually becomes dark, rather than preserving
 * the pale source brightness as CSS mix-blend-mode:color does.
 */
const SKIN_ART_BASE_LUMINANCE = 0.82;
const RGB_LUMINANCE = [0.2126, 0.7152, 0.0722] as const;

export function playerCharacterColorMatrix(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error("Player character tints must be six-digit hex colors");
  }
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const rows = channels.map(channel =>
    [...RGB_LUMINANCE.map(weight =>
      Number((channel * weight / SKIN_ART_BASE_LUMINANCE).toFixed(6))), 0, 0],
  );
  // Leave alpha untouched: all original antialiasing/transparency is retained.
  return [...rows.flat(), 0, 0, 0, 1, 0].join(" ");
}
