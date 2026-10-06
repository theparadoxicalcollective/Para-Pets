import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("shared nav visibility recognizes blocking modal ownership", () => {
  const source = read("client/src/lib/navVisibility.ts");

  assert.match(source, /GLOBAL_HUD_BLOCKER_SELECTOR/);
  assert.match(source, /\[data-global-hud-blocker="true"\]/);
  assert.match(source, /\[aria-modal="true"\]/);
  assert.match(source, /\[data-quest-guide-blocker="true"\]/);
  assert.match(source, /function isGlobalHudBlockerOpen\(\)/);
  assert.match(source, /getBoundingClientRect\(\)/);
  assert.match(source, /style\.display === "none"/);
  assert.match(source, /style\.visibility === "hidden"/);
  assert.match(source, /node\.getAttribute\("aria-hidden"\) !== "true"/);
  assert.match(source, /isGlobalHudBlockerOpen\(\)/);
});

test("global HUD visibility responds when a popup mounts or changes visibility", () => {
  const source = read("client/src/lib/navVisibility.ts");

  assert.match(source, /new MutationObserver/);
  assert.match(source, /childList: true/);
  assert.match(source, /subtree: true/);
  assert.match(source, /attributes: true/);
  assert.match(source, /"aria-modal"/);
  assert.match(source, /"data-global-hud-blocker"/);
  assert.match(source, /"data-quest-guide-blocker"/);
});

test("FloatingNav already yields to the shared visibility store", () => {
  const source = read("client/src/components/FloatingNav.tsx");
  assert.match(source, /const navHidden = useNavHidden\(\)/);
  assert.match(source, /if \(navHidden\) return null/);
});

test("Active Pet TopBar hides only its chrome while a modal remains mounted", () => {
  const source = read("client/src/components/TopBar.tsx");

  assert.match(source, /import \{ useNavHidden \} from "@\/lib\/navVisibility"/);
  assert.match(source, /const globalHudHidden = useNavHidden\(\)/);
  assert.match(source, /data-testid="top-bar-global-chrome"/);
  assert.match(source, /visibility: globalHudHidden \? "hidden" : "visible"/);
  assert.match(source, /pointerEvents: globalHudHidden \? "none" : "auto"/);

  const chrome = source.indexOf('data-testid="top-bar-global-chrome"');
  const rewards = source.indexOf("{showRewards && (");
  assert.ok(chrome >= 0);
  assert.ok(rewards > chrome, "Reward modal must stay mounted outside hidden TopBar chrome");
});

test("common player modals explicitly claim global HUD ownership", () => {
  const files = [
    "client/src/components/UserProfilePanel.tsx",
    "client/src/components/PlayerDetailPanel.tsx",
    "client/src/components/FriendProfileModal.tsx",
    "client/src/components/RewardClaimModal.tsx",
    "client/src/components/GiftClaimModal.tsx",
    "client/src/components/SendGiftModal.tsx",
    "client/src/components/PvpMatchmakingOverlay.tsx",
    "client/src/components/world/BeauPrizeWheelOverlay.tsx",
    "client/src/components/world/HauntedBingoOverlay.tsx",
    "client/src/components/world/SlaughterSlotsOverlay.tsx",
    "client/src/components/world/WorldShopOverlay.tsx",
    "client/src/components/world/WorldCaveOverlay.tsx",
  ];

  for (const file of files) {
    assert.match(
      read(file),
      /data-global-hud-blocker="true"/,
      `${file} should hide global HUD chrome while open`,
    );
  }
});

test("scene pages expose their existing blocking-camera state to global HUD ownership", () => {
  const world = read("client/src/pages/WorldPage.tsx");
  const central = read("client/src/pages/PetWorldPage.tsx");
  const home = read("client/src/pages/PetHousePage.tsx");

  assert.match(world, /data-global-hud-blocker=\{worldMapCameraBlocked \? "true" : undefined\}/);
  assert.match(central, /data-global-hud-blocker=\{petCentralCameraBlocked \? "true" : undefined\}/);
  assert.match(home, /data-global-hud-blocker=\{homeOutdoorCameraBlocked \? "true" : undefined\}/);
});

test("blocking World state still includes the popup families that need unobstructed close controls", () => {
  const source = read("client/src/pages/WorldPage.tsx");
  for (const state of [
    "showProfile",
    "showLocationView",
    "showShop",
    "showFishing",
    "showSellFish",
    "showDangerWarning",
    "showNoPetMessage",
    "showBattlePrep",
    "showBattle",
    "showCaveEntry",
    "showAddLocation",
    "editingLocation",
    "showAddObject",
    "showDecorPanel",
    "showItemPicker",
    "recipeDetail",
    "showRecipeBook",
  ]) {
    assert.match(source, new RegExp(state));
  }
});
