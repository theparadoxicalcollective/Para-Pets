import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fromRoot = (...segments: string[]) => path.join(repoRoot, ...segments);

test("desktop shell uses MainGameBG only in the large-screen presentation", () => {
  const app = readFileSync(fromRoot("client", "src", "App.tsx"), "utf8");
  const css = readFileSync(fromRoot("client", "src", "tabletStageShell.css"), "utf8");

  assert.ok(existsSync(fromRoot("attached_assets", "uploads", "MainGameBG.png")));
  assert.match(app, /import mainGameBg from "@assets\/uploads\/MainGameBG\.png";/);
  assert.match(app, /className="game-stage-shell"/);
  assert.match(app, /--desktop-stage-background-image/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /var\(--desktop-stage-background-image\)/);
  assert.match(css, /background-size: cover/);
});
