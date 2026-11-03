import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("Pet Park is the only reachable Central nav destination; legacy page remains for rollback", () => {
  assert.match(nav, /navigate\("\/pet-park"\)/);
  assert.match(nav, /label: "Pet Park"/);
  assert.match(app, /location === "\/pet-park"/);
  assert.match(app, /<PetParkPage/);

  // The old overlay was unreachable (showKeepers was never set true) but its
  // eager page import still pulled an obsolete game world into the nav bundle.
  assert.doesNotMatch(nav, /import PetWorldPage|showKeepers|setShowKeepers|keepers-nav-viewport-overlay/);
  assert.match(readFileSync("client/src/pages/PetWorldPage.tsx", "utf8"), /export default function PetWorldPage/);
});

test("Pet Park main-nav button checks live publishing state and shows only a themed message when closed", () => {
  const navHandler = nav.split('const openPetPark = async () => {')[1]?.split('const handleRight = (id: string) => {')[0];
  assert.ok(navHandler, "navigation should check access before changing route");
  assert.match(navHandler, /if \(user\.isAdmin\) \{ navigate\("\/pet-park"\); return; \}/);
  assert.match(navHandler, /queryClient\.fetchQuery<\{ enabledForPlayers: boolean \}>/);
  assert.match(navHandler, /queryFn: async \(\) => \(await apiRequest\("GET", "\/api\/pet-park\/status"\)\)\.json\(\)/);
  assert.match(navHandler, /staleTime: 0/);
  assert.match(navHandler, /if \(status\.enabledForPlayers\) \{/);
  assert.match(navHandler, /toast\(\{ title: "Pet Park is under construction" \}\)/);
  assert.match(navHandler, /Unable to check Pet Park availability/);
  assert.match(nav, /if \(id === "keepers"\) \{[\s\S]*?setTimeout\(\(\) => \{ void openPetPark\(\); \}, NAV_DELAY\)/);
  assert.match(nav, /label: "Pet Park"/);
  // Reuse the existing game-wide green/gold viewport toast instead of a
  // second modal or a hardcoded 390x844 phone viewport.
  const toast = readFileSync("client/src/components/ui/toast.tsx", "utf8");
  assert.match(toast, /border-\[#cba34b\] bg-\[#10271c\]\/95/);
  assert.match(toast, /w-\[min\(calc\(100%-2rem\),24rem\)\]/);
});

test("park status read is authenticated, lightweight and follows admin publishing choice", () => {
  const statusHandler = route.split('app.get("/api/pet-park/status", isAuthenticated, async (_req, res) => {')[1]
    ?.split('app.get("/api/pet-park/scene"')[0];
  assert.ok(statusHandler, "authenticated park availability route should exist");
  assert.match(statusHandler, /select\(\{ enabledForPlayers: petParkSettings\.enabledForPlayers \}\)/);
  assert.match(statusHandler, /eq\(petParkSettings\.id, "main"\)/);
  assert.match(statusHandler, /enabledForPlayers: settings\?\.enabledForPlayers \?\? false/);
  assert.doesNotMatch(statusHandler, /petParkDeposits|petParkSceneItems|petParkBuildings|shopItems|userInventory/);
  assert.match(statusHandler, /Unable to check Pet Park availability/);
  assert.match(route, /!settings\?\.enabledForPlayers && !player\?\.isAdmin/);
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
