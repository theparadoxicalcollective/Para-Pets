import sharp from "sharp";

/** Offline palette swaps of the approved seamless surface. Preserve its
 * caustic pattern and world-space scale without adding runtime effects. */
const source = "client/public/park-water-surface.webp";
const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const palettes = {
  haunted: [[21, 22, 45], [39, 41, 76], [65, 68, 125], [113, 119, 187], [190, 197, 239]],
  volcanic: [[40, 9, 17], [92, 20, 24], [157, 43, 26], [222, 91, 33], [255, 196, 95]],
} as const;
for (const [style, colors] of Object.entries(palettes)) {
  const output = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    // Green and blue carry the original water's luminous reflections.
    const tone = Math.max(0, Math.min(1, (.7 * data[i + 1] + .3 * data[i + 2] - 35) / 190));
    const position = Math.pow(tone, .85) * (colors.length - 1);
    const segment = Math.min(colors.length - 2, Math.floor(position));
    const blend = position - segment;
    for (let c = 0; c < 3; c++) output[i + c] = Math.round(colors[segment][c] * (1 - blend) + colors[segment + 1][c] * blend);
  }
  await sharp(output, { raw: { width: info.width, height: info.height, channels: 3 } })
    .webp({ quality: 93, effort: 6 }).toFile(`client/public/park-water-${style}.webp`);
}

// A single transparent caustic highlight layer, not another water surface.
// World-sized repeats use the same original caustics at half resolution.
const highlight = await sharp(source).resize(384, 256).removeAlpha().raw().toBuffer();
const shimmer = Buffer.alloc(384 * 256 * 4);
for (let i = 0, j = 0; i < highlight.length; i += 3, j += 4) {
  const tone = .7 * highlight[i + 1] + .3 * highlight[i + 2];
  shimmer[j] = 222; shimmer[j + 1] = 238; shimmer[j + 2] = 255;
  shimmer[j + 3] = Math.round(Math.max(0, Math.min(1, (tone - 56) / 115)) ** 1.25 * 36) * 4;
}
await sharp(shimmer, { raw: { width: 384, height: 256, channels: 4 } })
  .webp({ quality: 85, effort: 6 }).toFile("client/public/park-water-shimmer.webp");
