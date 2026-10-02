import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PET_HOUSE_PLAYER_MAX_SCALE,
  PET_HOUSE_PLAYER_MIN_SCALE,
  PET_HOUSE_PLAYER_SCALE_DECREASE_STEP,
  PET_HOUSE_PLAYER_SCALE_INCREASE_STEP,
  clampPetHousePlayerScale,
} from "../shared/housing";

const owner = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
const visitor = readFileSync("client/src/pages/VisitPetHousePage.tsx", "utf8");
const route = readFileSync("server/routes/petHousePosition.routes.ts", "utf8");
const visitorRoute = readFileSync("server/routes/petHouseVisitor.routes.ts", "utf8");
const storage = readFileSync("server/storage.ts", "utf8");
const schema = readFileSync("shared/schema.ts", "utf8");
const boot = readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");
const equip = readFileSync("client/src/pages/EquipAccessoriesPage.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");

test("Home pet size controls are bounded and use stronger decrease than increase", () => {
  assert.equal(PET_HOUSE_PLAYER_SCALE_DECREASE_STEP, 15);
  assert.equal(PET_HOUSE_PLAYER_SCALE_INCREASE_STEP, 10);
  assert.equal(PET_HOUSE_PLAYER_MIN_SCALE, 55);
  assert.equal(PET_HOUSE_PLAYER_MAX_SCALE, 140);
  assert.equal(clampPetHousePlayerScale(1), 55);
  assert.equal(clampPetHousePlayerScale(100), 100);
  assert.equal(clampPetHousePlayerScale(999), 140);
});

test("Pet House pet presentation is stored separately from pet inventory", () => {
  assert.match(schema, /scalePct: integer\("scale_pct"\)\.notNull\(\)\.default\(100\)/);
  assert.match(schema, /flipped: boolean\("flipped"\)\.notNull\(\)\.default\(false\)/);
  assert.match(boot, /ALTER TABLE pet_house_positions ADD COLUMN IF NOT EXISTS scale_pct INTEGER NOT NULL DEFAULT 100/);
  assert.match(boot, /ALTER TABLE pet_house_positions ADD COLUMN IF NOT EXISTS flipped BOOLEAN NOT NULL DEFAULT false/);
  assert.match(storage, /scalePct: petHousePositions\.scalePct/);
  assert.match(storage, /flipped: petHousePositions\.flipped/);
});

test("Pet House pet route clamps edits and preserves omitted legacy values", () => {
  assert.match(route, /existing\?\.scalePct \?\? 100/);
  assert.match(route, /existing\?\.flipped \?\? false/);
  assert.match(route, /Math\.max\(55, Math\.min\(140, Math\.round\(scalePct\)\)\)/);
});

test("owner pet UI selects before dragging and keeps the selected pet above peers", () => {
  assert.match(owner, /if \(popupPetId !== pet\.inventoryId\) \{/);
  assert.match(owner, /setTopPetId\(pet\.inventoryId\)/);
  assert.match(owner, /if \(outdoorPopupPetId !== pet\.inventoryId\) \{/);
  assert.match(owner, /setTopOutdoorPetId\(pet\.inventoryId\)/);
  assert.match(owner, /zIndex: isSelectedPet \? 180/);
});

test("pet edit panel exposes size, flip, Closet, and remove actions", () => {
  assert.match(owner, /data-testid="house-pet-control-panel"/);
  assert.match(owner, /data-testid="button-pet-home-size-minus"/);
  assert.match(owner, /data-testid="button-pet-home-size-plus"/);
  assert.match(owner, /data-testid="button-pet-home-flip"/);
  assert.match(owner, /data-testid="button-pet-home-closet"/);
  assert.match(owner, /data-testid="button-remove-pet-from-home"/);
});

test("Home pets keep saved scale and flip in owner and visitor views", () => {
  assert.match(owner, /petHouseDisplaySize\(cfg\.size, pet\)/);
  assert.match(owner, /transform: pet\.homeFlipped \? "scaleX\(-1\)" : undefined/);
  assert.match(visitor, /pet\.homeScalePct \?\? 100/);
  assert.match(visitor, /pet\.homeFlipped \? "scaleX\(-1\)" : undefined/);
  assert.match(visitorRoute, /homeScalePct: pos\?\.scalePct \?\? 100/);
  assert.match(visitorRoute, /homeFlipped: pos\?\.flipped \?\? false/);
});

test("Closet route opens the clicked Home pet without changing active pet", () => {
  assert.match(owner, /navigate\(\`\/equip-accessories\/\$\{encodeURIComponent\(outdoorPopupPet\.inventoryId\)\}\`\)/);
  assert.match(owner, /onOpenCloset=\{\(inventoryId\) => navigate/);
  assert.match(app, /location\.startsWith\("\/equip-accessories\/"\)/);
  assert.match(app, /petInventoryId=\{location\.startsWith/);
  assert.match(equip, /petInventoryId \?\? user\?\.activePetId/);
  assert.match(equip, /onClose=\{\(\) => navigate\(returnPath\)\}/);
});
