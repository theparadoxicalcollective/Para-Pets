/**
 * Browser-native tint for the shared avatar renderer.
 *
 * SVG fragment filters on transformed HTML layers may silently fail in iOS
 * WebKit. Built-in CSS color filters work on the same flattened DOM layer in
 * Safari and Chromium, preserve source alpha, and retain luminance detail.
 *
 * Grayscale gives arbitrary source art one consistent hue; a small brightness
 * before sepia prevents intermediate clipping. Hue + saturation supply the
 * chosen chroma, and the last brightness normalizes the artist's light base
 * paint (approximately 0.82 luma) to the requested RGB.
 *
 * The search is performed only once per unique swatch, never per animation
 * frame. No expensive canvas readbacks or separate alpha masks are needed.
 */
const REFERENCE_LUMA = 0.82;
const PRE_BRIGHTNESS = 0.4;
const LUMA = [0.2126, 0.7152, 0.0722] as const;
const BASE_SEPIA = [1.351, 1.203, 0.937].map(v => v * REFERENCE_LUMA * PRE_BRIGHTNESS);
const cache = new Map<string, string>();
const dot = (a: readonly number[], b: readonly number[]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (x: number, min: number, max: number) =>
  Math.max(min, Math.min(max, x));

function rotatedSepia(degrees: number): number[] {
  const radians = degrees * Math.PI / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const [r, g, b] = BASE_SEPIA;
  // W3C feColorMatrix hueRotate coefficients; all resulting CSS functions
  // are implemented natively by Safari, without an SVG URL reference.
  return [
    r * (.213 + .787*c - .213*s) + g * (.715 - .715*c - .715*s) + b * (.072 - .072*c + .928*s),
    r * (.213 - .213*c + .143*s) + g * (.715 + .285*c + .140*s) + b * (.072 - .072*c - .283*s),
    r * (.213 - .213*c - .787*s) + g * (.715 - .715*c + .715*s) + b * (.072 + .928*c + .072*s),
  ];
}
const rotations = Array.from({ length: 360 }, (_, degrees) => rotatedSepia(degrees));

export function playerCharacterCssTint(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex))
    throw new Error("Player character tints must be six-digit hex colors");
  const key = hex.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const desired = [1, 3, 5].map(i => parseInt(key.slice(i, i + 2), 16) / 255);
  const desiredLuma = dot(desired, LUMA);
  if (desiredLuma === 0) return "brightness(0)";
  let best = { error: Number.POSITIVE_INFINITY, hue: 0, saturation: 1, brightness: 1 };

  for (let hue = 0; hue < rotations.length; hue++) {
    const rotated = rotations[hue];
    const neutral = dot(rotated, LUMA);
    const delta = rotated.map(channel => channel - neutral);
    // Fit the requested chroma at this hue while keeping a consistent luma.
    const target = desired.map(channel => channel * neutral / desiredLuma);
    const size = dot(delta, delta);
    const saturation = size < 1e-12 ? 0 :
      clamp(dot(target.map(channel => channel - neutral), delta) / size, 0, 20);
    const toned = delta.map(channel => clamp(neutral + saturation * channel, 0, 1));
    const energy = dot(toned, toned);
    const brightness = energy < 1e-12 ? 0 : clamp(dot(toned, desired) / energy, 0, 20);
    const actual = toned.map(channel => clamp(channel * brightness, 0, 1));
    const error = actual.reduce((sum, channel, i) => sum + (channel - desired[i]) ** 2, 0);
    if (error < best.error) best = { error, hue, saturation, brightness };
  }

  const filter = `grayscale(1) brightness(${PRE_BRIGHTNESS}) sepia(1) hue-rotate(${best.hue}deg) saturate(${best.saturation.toFixed(3)}) brightness(${best.brightness.toFixed(3)})`;
  if (cache.size > 255) cache.clear();
  cache.set(key, filter);
  return filter;
}
