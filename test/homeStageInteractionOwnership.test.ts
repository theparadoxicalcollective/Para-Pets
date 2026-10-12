import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("Active Pet owns a full-device route, not the phone reference plane", () => {
  assert.match(app, /location === "\/"[\s\S]*<StagePageSurface layout="viewport">[\s\S]*<HomePage user=\{user\} isOverlayActive=\{false\} \/>[\s\S]*<\/StagePageSurface>/);
  assert.doesNotMatch(app, /location === "\/"[\s\S]{0,180}<div style=\{\{ position: "absolute", inset: 0, isolation: "isolate" \}\}>[\s\S]{0,180}<HomePage/);
});

test("stage page surface keeps native phone inline and portals only when viewport page exists", () => {
  assert.match(surface, /return target \? createPortal\(content, target\) : content/);
  assert.match(surface, /data-stage-reference-plane="true"/);
});

test("active pet interaction remains attached to the authored pet hit target", () => {
  assert.match(home, /data-testid="button-open-pet-actions"/);
  assert.match(home, /\.\.\.activePetTouchHandlers/);
  assert.doesNotMatch(home, /setShowActionMenu\(true\)/);
  assert.match(home, /data-testid="button-open-pet-menu"/);
});
