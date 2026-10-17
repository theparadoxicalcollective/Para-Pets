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

test("Cards restores pointer ownership inside the decorative viewport page host", () => {
  // App's viewport page host intentionally ignores pointer input. Cards must
  // opt back in at the root, like the working Pet Inventory page.
  const appHost = app.match(/id="game-viewport-page"[\\s\\S]{0,180}pointerEvents: "none"/);
  assert.ok(appHost, "the shared viewport page host should remain decorative");
  assert.match(cards, /data-testid="page-cards-collection"[\s\S]{0,620}pointerEvents: "auto"/);
  assert.match(cards, /onClick=\{\(\) => setRarityFilter\(filter\.rarity\)\}/);
  assert.match(cards, /onChange=\{\(event\) => setSortMode\(event\.target\.value\)\}/);
  assert.match(cards, /data-rarity-filter=\{rarityFilter \?\? "all"\}/);
  assert.match(cards, /cards\.filter\(card => rarityFilter === null \|\| card\.rarity === rarityFilter\)/);
  assert.match(cards, /data-testid="card-collection-scroll"/);
  assert.match(cards, /overflowY: "auto"/);
});
