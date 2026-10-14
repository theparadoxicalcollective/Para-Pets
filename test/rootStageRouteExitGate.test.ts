import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldUseDocumentLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const viewport = readFileSync("client/src/lib/stageViewport.ts", "utf8");

const nativeGameplay = [
  "/", "/map", "/world/haunted-forest", "/coins", "/pet-house", "/badges",
  "/market", "/pvp", "/pets", "/bag", "/cards", "/equip-accessories",
  "/equip-accessories/pet-123", "/pet-care/pet-123", "/pet-level-up/pet-123",
  "/games/molten-blocks", "/games/lava-crawl", "/friends", "/raid",
  "/raid/leaderboard", "/raid/battle", "/explore/elysian-bayou-clearing",
  "/visit/player-123",
] as const;
const nativeDocuments = [
  "/auth", "/reset-password/token", "/privacy", "/hub", "/forum", "/founders", "/admin",
] as const;

test("every explicitly rendered gameplay route owns a native viewport", () => {
  for (const route of nativeGameplay) {
    assert.equal(usesDeviceGameplaySurface(route), true, route);
    assert.equal(shouldUseDocumentLayout(route, 390), false, route);
  }
  assert.match(app, /if \(usesDeviceGameplaySurface\(location\)\)/);
});

test("every isolated document route bypasses the legacy portrait stage", () => {
  for (const route of nativeDocuments) {
    assert.equal(shouldUseDocumentLayout(route, 390), true, route);
    assert.equal(shouldUseDocumentLayout(route, 1440), true, route);
    assert.equal(usesDeviceGameplaySurface(route), false, route);
  }
  assert.match(app, /if \(shouldUseDocumentLayout\(location, layout\.viewportWidth\)\)/);
  assert.match(viewport, /usesDeviceGameplaySurface\(pathname\) \|\| shouldUseDocumentLayout\(pathname, viewport\.width\)/);
});

test("unknown and malformed routes cannot masquerade as an authored game scene", () => {
  for (const route of ["/not-a-route", "/visit", "/visit/a/b", "/pet-care", "/reset-password", "/world"]) {
    assert.equal(usesDeviceGameplaySurface(route), false, route);
    assert.equal(shouldUseDocumentLayout(route, 390), false, route);
  }
  assert.match(app, /<Route><Redirect to=\{user \? "\/" : "\/auth"\} \/><\/Route>/);
});

test("legacy renderer remains isolated for removal after route and test contract migration", () => {
  assert.match(app, /const expandedStage = layout\.coordinateOwner === "stage"/);
  assert.match(app, /transform: expandedStage \? `scale\(\$\{layout\.scale\}\)`/);
});
