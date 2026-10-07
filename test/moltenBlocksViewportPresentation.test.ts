import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const molten = readFileSync("client/src/pages/MoltenBlocksPage.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");

test("Molten Blocks scenery owns the full larger-device viewport", () => {
  assert.match(molten, /import ViewportBackdropPortal from "@\/components\/ViewportBackdropPortal"/);
  assert.match(molten, /data-testid="page-molten-blocks"[\s\S]*data-stage-coordinate-space="canonical"[\s\S]*data-viewport-visual-owner="backdrop"/);
  assert.match(molten, /<ViewportBackdropPortal>[\s\S]*data-testid="molten-blocks-viewport-backdrop"/);
  assert.match(molten, /data-canonical-visual-layer="duplicate-backdrop"/);
  assert.match(shell, /\[data-viewport-visual-owner="backdrop"\][\s\S]*background-color: transparent !important/);
});

test("Molten Blocks gameplay stays in its authored playfield", () => {
  assert.match(molten, /<Stat label="SCORE" value=\{score\} testId="text-score" \/>/);
  assert.match(molten, /<Stat label="LVL" value=\{level\} testId="text-level" \/>/);
  assert.match(molten, /data-testid=\{testId\}/);
  assert.match(molten, /data-testid="text-lives"/);
  assert.match(molten, /data-testid="button-pause"/);
  assert.match(molten, /tryMove\(-1, 0\)/);
  assert.match(molten, /tryRotate\(\)/);
  assert.match(molten, /hardDrop\(\)/);
});

test("native phone retains the original Molten Blocks artwork treatment", () => {
  assert.match(molten, /backgroundImage: \`url\(\$\{bgMolten\}\)\`/);
  assert.match(molten, /backgroundPosition: "center"/);
  assert.match(molten, /background: "rgba\(0,0,0,0\.62\)"/);
});
