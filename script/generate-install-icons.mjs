// Package the confirmed historical artwork without redrawing or changing it.
// Run from the repository root: node script/generate-install-icons.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "attached_assets", "masked-angel-icon-source.jpg");
const output = path.join(root, "client", "public");
const background = "#06110c";

for (const [name, size] of [
  ["favicon-32.png", 32],
  ["apple-touch-icon.png", 180],
  ["pwa-icon-192.png", 192],
  ["favicon.png", 512],
  ["pwa-icon-512.png", 512],
]) {
  await sharp(source).rotate().resize(size, size, { fit: "contain", background })
    .flatten({ background }).png().toFile(path.join(output, name));
}

// Keep the portrait inset so Android's icon masks retain the face and halo.
await sharp(source).rotate().resize(404, 404, { fit: "contain", background })
  .flatten({ background }).extend({ top: 54, bottom: 54, left: 54, right: 54, background })
  .png().toFile(path.join(output, "pwa-maskable-512.png"));
