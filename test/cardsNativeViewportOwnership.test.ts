import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const cards = readFileSync("client/src/pages/CardsCollectionPage.tsx", "utf8");

test("Cards collection uses full device viewport rather than 390x844 reference plane", () => {
  assert.equal(usesDeviceGameplaySurface("/cards"), true);
  assert.ok(app.includes(`location === "/cards" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("Cards retains collection UI, background portal, and detail popup", () => {
  assert.match(cards, /data-stage-coordinate-space="canonical"/);
  assert.match(cards, /<ViewportBackdropPortal>/);
  assert.match(cards, /<CardDetailDialog/);
  assert.match(cards, /<CardPreview/);
});
