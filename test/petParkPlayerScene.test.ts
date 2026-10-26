import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("Pet Park replaces Central nav but retains legacy implementation for safe rollback", () => {
  assert.match(nav, /navigate\("\/pet-park"\)/);
  assert.match(nav, /label: "Pet Park"/);
  assert.match(nav, /import PetWorldPage/);
  assert.match(app, /location === "\/pet-park"/);
  assert.match(app, /<PetParkPage/);
});

test("closed park has under-construction view and admin-only scene preview", () => {
  assert.match(page, /Pet Park — Under Construction/);
  assert.match(route, /!settings\?\.enabledForPlayers && !player\?\.isAdmin/);
  assert.match(page, /scene\?\.canEditPark/);
  assert.match(route, /if \(!park\?\.enabled\) return \{ status: 403/);
});

test("deposits require authenticated owner, hatched unlisted pet, open park and unlocked slot", () => {
  assert.match(route, /app\.post\("\/api\/pet-park\/deposits", isAuthenticated/);
  assert.match(route, /\.for\("update"\)/);
  assert.match(route, /eq\(userInventory\.userId, userId\)/);
  assert.match(route, /pet\.type !== "pet" \|\| pet\.isListed/);
  assert.match(route, /slotNumber > \(slots\?\.unlockedSlots \?\? 1\)/);
  assert.match(route, /isNull\(petParkDeposits\.withdrawnAt\)/);
});

test("withdrawal is owner-bound, serialized and works while park is closed", () => {
  assert.match(route, /app\.post\("\/api\/pet-park\/deposits\/:id\/withdraw", isAuthenticated/);
  assert.match(route, /eq\(petParkDeposits\.userId, userId\)/);
  const withdrawal = route.split('app.post("/api/pet-park/deposits/:id/withdraw"')[1];
  assert.doesNotMatch(withdrawal, /enabledForPlayers/);
  assert.match(withdrawal, /settleDeposit\(/);
});

test("scene pans both axes with viewport clamping and uses existing pet artwork renderer", () => {
  assert.match(page, /observeHomeViewport\(element, measure, "artwork-scene"\)/);
  assert.match(page, /onPointerMove/);
  assert.match(page, /drag\.panX \+ delta\.x/);
  assert.match(page, /drag\.panY \+ delta\.y/);
  assert.match(page, /petInventoryId=\{pet\.petInventoryId\}/);
  assert.match(page, /isParkSleepPosition\(position, scene\.items/);
  assert.match(page, /sleeping \? "sleep" : "idle"/);
  assert.match(page, /reduceMotion \? "static"/);
  assert.match(page, /Drag the park in any direction/);
});
