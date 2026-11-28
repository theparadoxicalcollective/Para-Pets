import { parkTerrainNoise } from "../client/src/lib/petParkTerrain";
import sharp from "sharp";

/** A single world-space water texture shared by every connected water patch.
 * The texture wraps on both axes, so the canvas can repeat it across arbitrary
 * painted shores without introducing seams, individual sprites or animation.
 */
const PARK_WATER_TEXTURE_WIDTH = 768;
const PARK_WATER_TEXTURE_HEIGHT = 512;

const wrap = (n: number, period: number) => ((n % period) + period) % period;
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function noiseField(columns: number, rows: number, salt: number) {
  const values = Float32Array.from({ length: columns * rows },
    (_, index) => parkTerrainNoise(index % columns, Math.floor(index / columns), salt));
  return (u: number, v: number) => {
    const x = u * columns, y = v * rows;
    const ix = Math.floor(x), iy = Math.floor(y);
    const x0 = wrap(ix, columns), x1 = (x0 + 1) % columns;
    const y0 = wrap(iy, rows) * columns, y1 = ((wrap(iy, rows) + 1) % rows) * columns;
    const fx = smooth(x - ix), fy = smooth(y - iy);
    return mix(mix(values[y0 + x0], values[y0 + x1], fx),
      mix(values[y1 + x0], values[y1 + x1], fx), fy);
  };
}

const columns = 14, rows = 27;
// The elongated, irregular cells represent reflections projected onto the
// same shallow 2.5D surface as existing terrain, not a new tile grid.
const sites = Array.from({ length: columns * rows }, (_, index) => {
  const col = index % columns, row = Math.floor(index / columns);
  return {
    x: .15 + .7 * parkTerrainNoise(col, row, 71),
    y: .15 + .7 * parkTerrainNoise(col, row, 72),
  };
});
const depth = noiseField(4, 5, 73);
const light = noiseField(8, 9, 74);
const bendX = noiseField(18, 26, 75);
const bendY = noiseField(17, 27, 76);
const fine = noiseField(35, 45, 77);
const flicker = noiseField(29, 41, 78);

/** Smooth, periodic field: dark emerald-blue depths, scattered turquoise
 * reflections and gently bent, flattened caustic lines. No camera, stamp,
 * time or device inputs, so all render paths sample exactly the same water.
 * Coordinates are normalized texture coordinates and may exceed 0..1.
 */
function sampleParkWater(u: number, v: number): readonly [number, number, number] {
  u = wrap(u, 1); v = wrap(v, 1);
  const x = u * columns + (bendX(u, v) - .5) * 1.05;
  const y = v * rows + (bendY(u, v) - .5) * .9;
  const cx = Math.floor(x), cy = Math.floor(y);
  let nearest = Infinity, second = Infinity;
  let nearX = 0, nearY = 0, secondX = 0, secondY = 0;
  for (let row = cy - 1; row <= cy + 1; row++) {
    const offset = wrap(row, rows) * columns;
    for (let col = cx - 1; col <= cx + 1; col++) {
      const site = sites[offset + wrap(col, columns)];
      const dx = col + site.x - x, dy = row + site.y - y;
      const d = dx * dx + dy * dy;
      if (d < nearest) {
        second = nearest; secondX = nearX; secondY = nearY;
        nearest = d; nearX = dx; nearY = dy;
      } else if (d < second) {
        second = d; secondX = dx; secondY = dy;
      }
    }
  }
  // Distance to the separating contour; domain warping curves the lines
  // instead of drawing rigid polygons. Broad halos and thinner interrupted
  // crests blend into dark, softly varying pools.
  const deltaX = nearX - secondX, deltaY = nearY - secondY;
  const span = Math.hypot(deltaX, deltaY);
  const edge = (second - nearest) / (2 * span);
  const wash = depth(u, v);
  const reflection = light(u, v);
  const grain = fine(u, v);
  const breakUp = flicker(u, v);
  // Oblique contours soften away into the pool. Reflective horizontal
  // crests show up only in illuminated patches, not as a continuous net.
  const direction = .22 + .78 * Math.abs(deltaY) / span;
  const strength = smooth(Math.max(0, (reflection - .15) / .85)) *
    (.28 + .72 * breakUp) * direction;
  const glow = smooth(Math.max(0, 1 - edge / .43));
  const crest = smooth(Math.max(0, 1 - edge / (.11 + grain * .04)));
  const pool = wash * .54 + reflection * .46;
  return [
    2 + 7 * pool + 19 * glow * strength + 38 * crest * strength,
    32 + 66 * pool + 82 * glow * strength + 105 * crest * strength + grain * 3,
    42 + 68 * pool + 80 * glow * strength + 94 * crest * strength + grain * 3,
  ];
}

// Generate the small, pre-rendered game texture offline. The extra wrapped
// pixels allow the soft brush blur to cross each edge before cropping, so
// repeating the finished image introduces no hard border.
async function main() {
  const width = PARK_WATER_TEXTURE_WIDTH, height = PARK_WATER_TEXTURE_HEIGHT;
  const pad = 4, stride = width + pad * 2;
  const pixels = Buffer.alloc(stride * (height + pad * 2) * 3);
  for (let y = -pad; y < height + pad; y++) {
    for (let x = -pad; x < width + pad; x++) {
      const color = sampleParkWater((x + .5) / width, (y + .5) / height);
      const at = ((y + pad) * stride + x + pad) * 3;
      for (let channel = 0; channel < 3; channel++) {
        pixels[at + channel] = Math.round(Math.min(255, Math.max(0, color[channel])));
      }
    }
  }
  const softened = await sharp(pixels, { raw: { width: stride, height: height + pad * 2, channels: 3 } })
    .blur(.85).raw().toBuffer();
  await sharp(softened, { raw: { width: stride, height: height + pad * 2, channels: 3 } })
    .extract({ left: pad, top: pad, width, height }).webp({ quality: 93, effort: 6 })
    .toFile("client/public/park-water-surface.webp");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
