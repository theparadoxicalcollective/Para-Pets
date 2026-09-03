import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fromRoot = (...segments: string[]) => path.join(repoRoot, ...segments);

test("the previous game artwork is restored on every install icon surface", async () => {
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
    ["favicon-32.png", 32, "15a9bf78c378979eb47ee37d4f01dc403020c25b"],
    ["apple-touch-icon.png", 180, "9a20c46091c2f89a05a949c8aed575a35ca50ce5"],
    ["pwa-icon-192.png", 192, "3daab90e260fdb8991a95e707e4a0a0183077827"],
    ["favicon.png", 512, "d9390a96bd8c92bc7330bf05200ad2b1a9f274d1"],
    ["pwa-icon-512.png", 512, "d9390a96bd8c92bc7330bf05200ad2b1a9f274d1"],
    ["pwa-maskable-512.png", 512, "58bd417bf41b06f5cdbdbe8250a7143d435c0829"],
  ] as const;

  for (const [file, size, previousBlobSha] of expected) {
    const bytes = readFileSync(fromRoot("client", "public", file));
    // Check the actual historical artwork, not just that a same-sized PNG exists.
    const blobSha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(blobSha, previousBlobSha, file);
    const metadata = await sharp(bytes).metadata();
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
