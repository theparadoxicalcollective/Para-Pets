import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fromRoot = (...segments: string[]) => path.join(repoRoot, ...segments);

test("the uploaded game artwork drives every install icon surface", async () => {
  assert.ok(existsSync(fromRoot(
    "attached_assets", "uploads", "50E7DE46-38A6-477A-9C60-2DF11D39DB12.png"
  )));

  const manifest = JSON.parse(
    readFileSync(fromRoot("client", "public", "manifest.json"), "utf8")
  );
  assert.equal(manifest.name, "Para Pets");
  assert.equal(manifest.short_name, "Para Pets");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.deepEqual(manifest.icons, [
    { src: "/pwa-icon-192.png?v=5", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/pwa-icon-512.png?v=5", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/pwa-maskable-512.png?v=5", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);

  const expected = [
    ["favicon-32.png", 32],
    ["apple-touch-icon.png", 180],
    ["pwa-icon-192.png", 192],
    ["favicon.png", 512],
    ["pwa-icon-512.png", 512],
    ["pwa-maskable-512.png", 512],
  ] as const;

  for (const [file, size] of expected) {
    const metadata = await sharp(fromRoot("client", "public", file)).metadata();
    assert.equal(metadata.format, "png", file);
    assert.equal(metadata.width, size, file);
    assert.equal(metadata.height, size, file);
  }

  const html = readFileSync(fromRoot("client", "index.html"), "utf8");
  assert.match(html, /apple-touch-icon\.png\?v=5/);
  assert.match(html, /pwa-icon-512\.png\?v=5/);
  assert.match(html, /manifest\.json\?v=6/);
  assert.match(html, /name="application-name" content="Para Pets"/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Para Pets"/);

  const app = readFileSync(fromRoot("client", "src", "App.tsx"), "utf8");
  assert.match(app, /if \(!user && location === "\/"\)/);
  assert.match(app, /<AuthPage \/>/);
});

