import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clientPointInRenderedElement } from "../client/src/lib/stage";

const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");

test("Bag stays opted into full-device rendering; map migration preserves other reference routes", () => {
  assert.match(app, /location === "\/bag"[\s\S]{0,75}<StagePageSurface layout="viewport">/);
  assert.ok(app.includes(`location === "/map" && (\n          <StagePageSurface layout="viewport">`));
  for (const route of ["/pet-house", "/pet-care/"]) {
    const start = app.indexOf(`location === "${route}"`);
    if (start >= 0) assert.doesNotMatch(app.slice(start, start + 90), /layout="viewport"/);
  }
  assert.match(surface, /layout = "reference"/);
  assert.match(surface, /fullViewport \? children : <div/);
  assert.match(surface, /return target \? createPortal\(content, target\) : content/);
  assert.match(surface, /data-stage-reference-plane="true"/);
});

test("full-device Bag uses scene viewport CSS units rather than 390x844 units", () => {
  assert.match(surface, /"--vh": "calc\(var\(--viewport-surface-height\) \/ 100\)"/);
  assert.match(surface, /"--vw": "calc\(var\(--viewport-surface-width\) \/ 100\)"/);
  assert.match(inventory, /data-page-presentation="full-viewport"/);
  assert.match(inventory, /clientPointInRenderedElement\(/);
});

test("drag point maps to the actual full HUD at different screen sizes", () => {
  const rect = {left: 40, top: 20, width: 900, height: 1200};
  const result = clientPointInRenderedElement(rect, 490, 620, 600, 800);
  assert.deepEqual(result, {x: 300, y: 400});
});
