import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const styles = readFileSync("client/src/index.css", "utf8");
const effects = readFileSync("client/src/lib/interactionEffects.ts", "utf8");

test("interactive controls retain audio feedback and add lightweight sparkle feedback", () => {
  assert.match(app, /playClick\(\)/);
  assert.match(app, /showClickSparkles\(e\.clientX, e\.clientY\)/);
  assert.match(app, /:disabled, \[aria-disabled="true"\]/);
  assert.match(effects, /prefers-reduced-motion: reduce/);
  assert.match(effects, /window\.setTimeout\(\(\) => burst\.remove\(\)/);
  assert.match(styles, /\.game-click-sparkles/);
  assert.match(styles, /@keyframes game-click-particle/);
});

test("page entrances use a short magical veil and respect reduced motion", () => {
  assert.match(styles, /\.page-overlay::after/);
  assert.match(styles, /@keyframes page-magic-veil/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
