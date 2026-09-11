import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("client/src/pages/PetInventoryPage.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const state = readFileSync("client/src/lib/beginJourney.ts", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");

test("owned pets never skip an unfinished player to tutorial completion", () => {
  assert.doesNotMatch(page, /hasAnyPet/);
  assert.doesNotMatch(page, /hasUnhatchedEgg/);
  assert.doesNotMatch(page, /bjSetStep\(6\)/);
});

test("legacy, missing, and locally done state recover at starter selection once", () => {
  assert.match(state, /const CURRENT_FLOW_VERSION = "2"/);
  assert.match(state, /export function bjIsCurrentFlowVersion/);
  assert.match(app, /!bjIsCurrentFlowVersion\(\)/);
  assert.match(app, /bjGetStatus\(\) === "done"/);
  assert.match(app, /bjGetStatus\(\) === "not_started"/);
  assert.match(app, /bjRestart\(\)/);
});

test("starter grant reuses only the requested unhatched 3-star egg", () => {
  assert.match(routes, /WHERE id = \$\{petId\}[\s\S]*?COALESCE\(star_rarity, rarity\) = 3/);
  assert.match(routes, /ui\.shop_item_id = \$\{petId\}/);
  assert.match(routes, /COALESCE\(ui\.is_hatched, false\) = false/);
  assert.doesNotMatch(routes, /WHERE ui\.user_id = \$\{userId\} AND si\.type = 'pet'/);
});
