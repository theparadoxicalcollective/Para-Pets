import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const source = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");
test("Level Up groups title, pet, and items into readable responsive regions", () => {
  assert.ok(source.includes(".lupage-tray::before"));
  assert.ok(source.includes("LEVEL UP ITEMS"));
  assert.ok(source.includes("env(safe-area-inset-top, 0px) + 20px"));
  assert.ok(source.includes(".lupage-nameplate{width:min(95%,440px)"));
  assert.ok(source.includes(".lupage-pet-zone{width:min(86vw,42vh,390px)"));
});
test("Level Up retains pet drop and item pointer interactions", () => {
  assert.ok(source.includes('data-testid="zone-levelup-pet-drop"'));
  assert.ok(source.includes("onPointerDown={(event) => onPointerDown(event, item)}"));
  assert.ok(source.includes("onPointerUp={onPointerUp}"));
  assert.ok(source.includes("PetPageOvalPlacement page=\"levelUp\""));
});
