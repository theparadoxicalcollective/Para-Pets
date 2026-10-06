import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const collection = readFileSync("client/src/pages/CardsCollectionPage.tsx", "utf8");
const detail = readFileSync("client/src/components/CardDetailDialog.tsx", "utf8");

test("Cards collection stays on the canonical stage and extends its own backdrop", () => {
  assert.match(collection, /data-stage-coordinate-space="canonical"/);
  assert.match(collection, /import ViewportBackdropPortal from "@\/components\/ViewportBackdropPortal"/);
  assert.match(collection, /<ViewportBackdropPortal>/);
  assert.match(collection, /data-testid="cards-viewport-backdrop"/);
  assert.match(collection, /linear-gradient\(180deg, #06150d 0%, #0a2117 48%, #06120d 100%\)/);
});

test("Cards close control stays responsive near the iOS Safari edge", () => {
  assert.match(collection, /data-testid="button-close-cards"[\s\S]*data-ios-edge-control="true"/);
  assert.match(collection, /touchAction: "manipulation"/);
  assert.match(collection, /WebkitTapHighlightColor: "transparent"/);
});

test("full-screen card viewer uses the shared viewport modal layer", () => {
  assert.match(detail, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);
  assert.match(detail, /<ViewportModalPortal>/);
  assert.match(detail, /data-stage-coordinate-space="viewport-modal"/);
  assert.doesNotMatch(detail, /<Dialog\.Portal>/);
  assert.doesNotMatch(detail, /className="fixed inset-0/);
  assert.match(detail, /className="absolute inset-0 z-\[100000\] bg-black\/90"/);
  assert.match(detail, /className="absolute inset-0 z-\[100001\]/);
});

test("card viewer artwork background and close control remain inside the shared modal surface", () => {
  assert.match(detail, /className="pointer-events-none absolute inset-0"/);
  assert.match(detail, /backgroundImage: `linear-gradient\(rgba\(3,13,8,\.70\), rgba\(3,13,8,\.82\)\), url/);
  assert.match(detail, /aria-label="Close card viewer"[\s\S]*data-ios-edge-control="true"/);
});

test("card flipping and collection reward behavior remain unchanged", () => {
  assert.match(detail, /data-testid="card-turn-surface"/);
  assert.match(detail, /onPointerDown=\{beginTurn\}/);
  assert.match(detail, /onPointerMove=\{moveTurn\}/);
  assert.match(detail, /onPointerUp=\{\(event\) => finishTurn\(event, true\)\}/);
  assert.match(detail, /animateTurnTo\(gesture\.baseAngle \+ direction \* 180\)/);
  assert.match(collection, /apiRequest\("POST", `\/api\/cards\/\$\{cardId\}\/claim`\)/);
});
