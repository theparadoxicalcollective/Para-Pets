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
  assert.match(navHandler, /queryClient\.fetchQuery<\{ enabledForPlayers: boolean; canEnterPark: boolean \}>/);
  assert.match(navHandler, /queryFn: async \(\) => \(await apiRequest\("GET", "\/api\/pet-park\/status"\)\)\.json\(\)/);
  assert.match(navHandler, /staleTime: 0/);
  assert.match(navHandler, /if \(status\.canEnterPark\) \{/);
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
  assert.match(statusHandler, /select\(\{ enabledForPlayers: petParkSettings\.enabledForPlayers, enabledForModerators: petParkSettings\.enabledForModerators \}\)/);
  assert.match(statusHandler, /eq\(petParkSettings\.id, "main"\)/);
  assert.match(statusHandler, /enabledForPlayers: settings\?\.enabledForPlayers \?\? false/);
  assert.doesNotMatch(statusHandler, /petParkDeposits|petParkSceneItems|petParkBuildings|shopItems|userInventory/);
  assert.match(statusHandler, /Unable to check Pet Park availability/);
  assert.match(route, /if \(!canEnterPark\) \{/);
});

test("closed park has under-construction view and admin-only scene preview", () => {
  assert.match(page, /Pet Park — Under Construction/);
  assert.match(route, /if \(!canEnterPark\) \{/);
  assert.match(page, /scene\?\.canEditPark/);
  assert.match(route, /if \(!park\?\.enabled && !role\?\.isAdmin && !\(park\?\.moderators && role\?\.isModerator\)\) return \{ status: 403/);
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
  assert.match(page, /const animateOutdoor = animateParkOutdoorPet\(zoom, reduceMotion, isMine\)/);
  assert.match(page, /mode=\{!animateOutdoor \? "static" : sleeping \? "sleep" : "idle"\}/,
    "the existing animator becomes static for reduced motion or distant visitors");
  assert.match(page, /data-testid="pet-park-player-slots"/);
});

test("moderator-only park access keeps ordinary players out and preserves reward pause", () => {
  const schema = readFileSync("shared/schema.ts", "utf8");
  const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
  const adminRoutes = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
  const slotRoutes = readFileSync("server/routes/petParkSlots.routes.ts", "utf8");
  const editor = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
  assert.ok(schema.includes('enabledForModerators: boolean("enabled_for_moderators").notNull().default(false)'));
  assert.ok(migration.includes("ALTER TABLE pet_park_settings ADD COLUMN IF NOT EXISTS enabled_for_moderators boolean NOT NULL DEFAULT false"));
  assert.ok(adminRoutes.includes("enabledForPlayers, enabledForModerators, coinsPerHour, essencePerHour, petXpPerHour, updatedAt: now"));
  assert.ok(editor.includes('Allow moderators into Pet Park'));
  assert.ok(route.includes("canEnterPark: !!role?.isAdmin || !!settings?.enabledForPlayers || (!!settings?.enabledForModerators && !!role?.isModerator)"));
  assert.ok(route.includes("pausedAt: park.enabled ? null : new Date()"));
  assert.ok(slotRoutes.includes("!park?.enabled && !(park?.moderators && role?.isModerator)"));
  const access = (publicOpen: boolean, modOpen: boolean, admin: boolean, moderator: boolean) => admin || publicOpen || (modOpen && moderator);
  assert.equal(access(false,false,false,false), false);
  assert.equal(access(false,true,false,false), false);
  assert.equal(access(false,true,false,true), true);
  assert.equal(access(true,false,false,false), true);
  assert.equal(access(false,false,true,false), true);
});

test("park pet slots stay compact and centered, with no visible spot-number labels", () => {
  // Earlier pointer handlers also query this test ID. Slice from its actual
  // rendered JSX occurrence instead of matching the first JS selector string.
  const slots = page.slice(page.lastIndexOf('data-testid="pet-park-player-slots"')).split('{activeSlot != null &&')[0];
  assert.ok(slots, "the player slots render in their existing viewport HUD");
  assert.match(slots, /mx-auto grid w-full max-w-\[294px\] grid-cols-3/);
  assert.match(slots, /min-h-\[96px\]/);
  assert.match(slots, /size=\{58\}/, "equipped portrait scales with smaller oval");
  assert.match(slots, /pet-park-slot__empty-art h-\[56px\] w-\[60px\]/);
  assert.doesNotMatch(slots, />Spot \{slot\}<\/span>/, "remove spot numbers from the ovals only");
  assert.match(slots, /aria-label=\{\`Pet Park spot \$\{slot\}\`\}/,
    "slot access remains named for screen readers");
  assert.match(slots, /<PetParkSlotProgress/, "reward progress stays visible");
  assert.match(slots, /onPointerDown=\{event => \{ if \(pet\) startEquippedPetDrag/,
    "equipped pets can still be dragged into the park");
});

test("visitor park shows three oval spots with existing equip and unlock paths", () => {
  assert.ok(page.includes('data-testid="pet-park-player-slots"'));
  assert.ok(page.includes("Array.from({ length: 3 }"));
  assert.ok(page.includes("pet-park-slot"));
  assert.ok(page.includes("slotTapEffect"));
  assert.ok(page.includes("PetParkRewardBars"));
  assert.ok(page.includes("body: { petInventoryId: selectedPet, slotNumber: activeSlot }"));
  assert.ok(page.includes('aria-label="Close pet spot"'));
});
