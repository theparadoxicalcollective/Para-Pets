import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fromRoot = (...segments: string[]) => path.join(repoRoot, ...segments);

test("the confirmed masked angel artwork is used on every install icon surface", async () => {
  const source = readFileSync(fromRoot("attached_assets", "masked-angel-icon-source.jpg"));
  assert.equal(
    createHash("sha1").update(`blob ${source.length}\0`).update(source).digest("hex"),
    "f4e064706252055c46bea2a5a728a3978fc2ede0",
    "preserve the exact historical masked angel source",
  );
  const manifest = JSON.parse(
    readFileSync(fromRoot("client", "public", "manifest.json"), "utf8")
  );
  assert.equal(manifest.name, "Para Pets");
  assert.equal(manifest.short_name, "Para Pets");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.deepEqual(manifest.icons, [
    { src: "/pwa-icon-192.png?v=6", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/pwa-icon-512.png?v=6", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/pwa-maskable-512.png?v=6", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);

  const expected = [
    ["favicon-32.png", 32, "213f2586f0d4c4920f36d8c036f58b6b41068871"],
    ["apple-touch-icon.png", 180, "820c1846570f7367b61834019cfb4b582384190e"],
    ["pwa-icon-192.png", 192, "fec8dc2707c8c3b128e2036100af3b250a38a4c6"],
    ["favicon.png", 512, "91c85416fa2d15218f9621c8fe560bb67679529f"],
    ["pwa-icon-512.png", 512, "91c85416fa2d15218f9621c8fe560bb67679529f"],
    ["pwa-maskable-512.png", 512, "2b91365601ca5aebef4215c963872737de220d92"],
  ] as const;

  for (const [file, size, expectedBlobSha] of expected) {
    const bytes = readFileSync(fromRoot("client", "public", file));
    // Check the packaged artwork as well as its dimensions and real PNG format.
    const blobSha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(blobSha, expectedBlobSha, file);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "png", file);
    assert.equal(metadata.width, size, file);
    assert.equal(metadata.height, size, file);
  }

  const html = readFileSync(fromRoot("client", "index.html"), "utf8");
  assert.match(html, /apple-touch-icon\.png\?v=6/);
  assert.match(html, /pwa-icon-512\.png\?v=6/);
  assert.match(html, /manifest\.json\?v=7/);
  assert.match(html, /name="application-name" content="Para Pets"/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Para Pets"/);

  const app = readFileSync(fromRoot("client", "src", "App.tsx"), "utf8");
  assert.match(app, /if \(!user && location === "\/"\)/);
  assert.match(app, /<AuthPage \/>/);
});
