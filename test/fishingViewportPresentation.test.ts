import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fishing = readFileSync("client/src/pages/FishingPage.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");

test("Fishing scenery owns the full viewport on larger devices", () => {
  assert.match(fishing, /import ViewportBackdropPortal from "@\/components\/ViewportBackdropPortal"/);
  assert.match(fishing, /data-testid="fishing-page"[\s\S]*data-stage-coordinate-space="canonical"[\s\S]*data-viewport-visual-owner="backdrop"/);
  assert.match(fishing, /<ViewportBackdropPortal>[\s\S]*data-testid="fishing-viewport-backdrop"/);
  assert.match(fishing, /data-canonical-visual-layer="duplicate-backdrop"/);
  assert.match(shell, /\[data-viewport-visual-owner="backdrop"\][\s\S]*background-color: transparent !important/);
  assert.match(shell, /\[data-canonical-visual-layer="duplicate-backdrop"\][\s\S]*display: none !important/);
});

test("Fishing gameplay remains in the authored coordinate plane", () => {
  assert.match(fishing, /data-testid="button-cast-pond"/);
  assert.match(fishing, /bottom: pondBottom/);
  assert.match(fishing, /left: "50%"/);
  assert.match(fishing, /width: "72%"/);
  assert.match(fishing, /onClick=\{handleNibbleTap\}/);
});

test("Fishing server attempt lifecycle remains unchanged", () => {
  assert.match(fishing, /\/api\/fishing\/attempts\/\$\{attemptId\}\/abandon/);
  assert.match(fishing, /setPhase\("idle"\)/);
  assert.match(fishing, /clearAllTimers\(\)/);
});
