import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const badges = readFileSync("client/src/pages/BadgePage.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");

test("Badges paints its environment across the full device", () => {
  assert.match(badges, /import ViewportBackdropPortal from "@\/components\/ViewportBackdropPortal"/);
  assert.match(badges, /data-testid="badges-page"[\s\S]*data-stage-coordinate-space="canonical"[\s\S]*data-viewport-visual-owner="backdrop"/);
  assert.match(badges, /<ViewportBackdropPortal>[\s\S]*data-testid="badges-viewport-backdrop"/);
  assert.match(badges, /data-canonical-visual-layer="duplicate-backdrop"/);
  assert.match(shell, /\[data-viewport-visual-owner="backdrop"\][\s\S]*background-color: transparent !important/);
  assert.match(shell, /\[data-canonical-visual-layer="duplicate-backdrop"\][\s\S]*display: none !important/);
});

test("Badges keeps its authored content and behavior canonical", () => {
  assert.match(badges, /data-testid="button-back-badges"/);
  assert.match(badges, /grid grid-cols-3 gap-3/);
  assert.match(badges, /data-testid=\{\`card-badge-\$\{badge\.id\}\`\}/);
  assert.match(badges, /queryKey: \["\/api\/badges"\]/);
  assert.match(badges, /queryKey: \["\/api\/user\/badges"\]/);
});

test("native phone keeps the existing inline badge artwork", () => {
  assert.match(badges, /backgroundImage: \`url\(\$\{bgImg\}\)\`/);
  assert.match(badges, /backgroundPosition: "center top"/);
});
