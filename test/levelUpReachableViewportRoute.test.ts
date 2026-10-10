import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPlayerRoutePresentation, shouldHideFloatingNav } from "../client/src/lib/playerPagePresentation";

const app = readFileSync("client/src/App.tsx", "utf8");

test("Level Up uses reachable full-viewport stage branch instead of isolated switch", () => {
  assert.equal(getPlayerRoutePresentation("/pet-level-up/abc"), "stage");
  assert.equal(shouldHideFloatingNav("/pet-level-up/abc"), true);
  assert.match(app, /location\.startsWith\("\/pet-level-up\/"\)[\s\S]{0,120}<StagePageSurface key=\{location\} layout="viewport">/);
  assert.doesNotMatch(app, /<Route path="\/pet-level-up\/:inventoryId">/);
});

test("stage branch renders only active route, keeping Home unmounted on Level Up", () => {
  assert.match(app, /location === "\/" && \([\s\S]{0,90}<StagePageSurface>[\s\S]{0,90}<HomePage/);
  assert.match(app, /location\.startsWith\("\/pet-level-up\/"\)[\s\S]{0,170}<PetLevelUpRoute/);
});

test("public isolated routes remain isolated", () => {
  for (const route of ["/auth", "/hub", "/visit/a", "/reset-password/abc"]) {
    assert.equal(getPlayerRoutePresentation(route), "isolated");
  }
});
