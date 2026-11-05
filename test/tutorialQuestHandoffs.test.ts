import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getMainNavOpen, setMainNavOpen, subscribeMainNav,
} from "../client/src/lib/mainNavState";
import { shouldPauseNpcDiscoveryTour } from "../client/src/lib/questGuideOwnership";
import { jansonMarketUnlocked, jansonQuestStatus } from "../server/jansonQuestRules";

const read = (path: string) => readFileSync(path, "utf8");

test("the actual main menu exposes open, closed and unsubscribed changes to guides", () => {
  setMainNavOpen(false);
  const changes: boolean[] = [];
  const stop = subscribeMainNav(() => changes.push(getMainNavOpen()));
  setMainNavOpen(true);
  setMainNavOpen(true); // no duplicate
  setMainNavOpen(false);
  stop();
  setMainNavOpen(true);
  assert.deepEqual(changes, [true, false]);
  setMainNavOpen(false);

  const nav = read("client/src/components/FloatingNav.tsx");
  const lonelle = read("client/src/components/LonelleQuestOverlay.tsx");
  const tour = read("client/src/components/NpcQuestDiscoveryGuide.tsx");
  assert.match(nav, /setMainNavOpen\(isOpen && !navHidden\)/);
  assert.match(nav, /return \(\) => setMainNavOpen\(false\)/);
  assert.match(nav, /aria-expanded=\{isOpen\}/);
  assert.match(lonelle, /const mainNavOpen = useMainNavOpen\(\)/);
  assert.match(lonelle, /const mapOpen = mainNavOpen && !!navMap/);
  assert.match(tour, /const mapIsOpen = mainNavOpen && !!navMap/);
});

test("a live NPC quest pauses the optional blocking discovery tour, not the quest itself", () => {
  assert.equal(shouldPauseNpcDiscoveryTour({}), false);
  for (const status of ["accepted", "found", "taken"]) {
    assert.equal(shouldPauseNpcDiscoveryTour({ lonelleStatus: status }), true);
  }
  assert.equal(shouldPauseNpcDiscoveryTour({ lonelleStatus: "claimed" }), false);
  for (const status of ["accepted", "completed"]) {
    assert.equal(shouldPauseNpcDiscoveryTour({ ginnyStatus: status }), true);
    assert.equal(shouldPauseNpcDiscoveryTour({ jansonStatuses: [status] }), true);
  }
  assert.equal(shouldPauseNpcDiscoveryTour({ jansonStatuses: ["claimed", "available", "locked"] }), false);
  const tour = read("client/src/components/NpcQuestDiscoveryGuide.tsx");
  assert.match(tour, /const shouldLoadTour = eligible && !activeQuest && !waitingForQuestState/);
  assert.match(tour, /usePrimaryQuestGuideOwner\("npc-discovery", shouldLoadTour && index < worlds.length\)/);
  assert.match(tour, /if \(!shouldLoadTour \|\| blockingOverlay/);
  assert.match(tour, /button-skip-npc-guide/);
});

test("after equipping Lonelle's scarf the player can return without reopening a stuck menu", () => {
  const lonelle = read("client/src/components/LonelleQuestOverlay.tsx");
  assert.match(lonelle, /state\.status === "taken" && state\.scarfEquipped && !inBayou/);
  assert.match(lonelle, /data-testid="button-return-to-lonelle"/);
  assert.match(lonelle, /onClick=\{\(\) => navigate\(WORLD\)\}/);
  assert.match(lonelle, /Return to Lonelle in the Bayou/);
  assert.match(lonelle, /button-close-equip-accessories/);
  assert.match(lonelle, /button-talk-lonelle/);
  assert.match(lonelle, /blockingGuide=\{false\}/);
  const server = read("server/routes/lonelleQuest.routes.ts");
  assert.match(server, /Equip the scarf in the third adornment space before returning it/);
  assert.match(server, /status: "claimed"/);
});

test("Janson's first sale journey accepts quest before opening real market and preserves rewards", () => {
  const janson = read("client/src/components/JansonQuestOverlay.tsx");
  const world = read("client/src/pages/WorldPage.tsx");
  const sell = read("client/src/pages/SellFishPage.tsx");
  assert.equal(jansonMarketUnlocked(false, { accepted_at: new Date() }), false);
  assert.equal(jansonMarketUnlocked(true, null), false);
  assert.equal(jansonMarketUnlocked(true, { accepted_at: new Date() }), true);
  assert.equal(jansonQuestStatus("sell_fish", null, false), "locked");
  assert.equal(jansonQuestStatus("sell_fish", null, true), "available");
  assert.match(janson, /else if \(key === "sell_fish"\) \{/);
  assert.match(janson, /window\.dispatchEvent\(new Event\("para:open-fish-market"\)\)/);
  assert.match(janson, /Start Sell Fish · Open Market/);
  assert.match(janson, /jansonHint=1/);
  assert.match(world, /window\.addEventListener\("para:open-fish-market", openFishMarket\)/);
  assert.match(world, /<SellFishPage/);
  assert.match(sell, /onClick=\{handleConfirmSell\}/);
  assert.match(sell, /onClick=\{\(\) => addToCart\(fish\)\}/);
  assert.match(sell, /Tap a fish below, then Confirm Sale/);
  assert.match(sell, /data-testid="button-find-fishing-spots-from-market"/);
  assert.match(sell, /onClose\(\);\s*window\.dispatchEvent\(new Event\("para:show-fishing-spots"\)\)/);
  assert.match(sell, /data-testid="button-retry-fish-inventory"/);
  assert.match(sell, /if \(e\.pointerType !== "mouse"\) return/);
  assert.match(sell, /queryClient\.invalidateQueries\(\{ queryKey: \["\/api\/quests\/janson"\] \}\)/);
  const backend = read("server/fishSale.ts");
  assert.match(backend, /WHERE p\.user_id = \$\{userId\} AND p\.quest_key = 'sell_fish'/);
  assert.match(backend, /return \{ sold: sortedIds\.length, coinsEarned, newBalance: updatedPlayer\.coins \}/);
});
