import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_HAUNTED_CASINO_HOTSPOTS,
  HAUNTED_CASINO_BETS,
  HAUNTED_SLOT_SYMBOL_WEIGHTS,
  evaluateHauntedSlotResult,
} from "../shared/hauntedCasino";

const ASSETS = [
  "HauntedCasinoMainBG.png",
  "SlaughterSlotsLogo.png",
  "SlotCloseButton.png",
  "SlotMachine.png",
  "SlotMachineHandle.png",
  "SlotMinusButton.png",
  "SlotPlusButton.png",
  "SlotSpinButton.png",
];

test("Haunted Casino upload bundle contains every requested production asset", () => {
  for (const filename of ASSETS) {
    assert.ok(
      fs.existsSync(path.join(process.cwd(), "attached_assets", "uploads", filename)),
      `${filename} should exist`,
    );
  }
});

test("Haunted Casino starts with exactly the five requested interactive areas", () => {
  assert.deepEqual(
    DEFAULT_HAUNTED_CASINO_HOTSPOTS.map((spot) => spot.id).sort(),
    ["bingo", "blackjack", "poker", "scratch", "slots"].sort(),
  );
  assert.ok(DEFAULT_HAUNTED_CASINO_HOTSPOTS.every((spot) => spot.size >= 6));
});

test("Slaughter Slots keeps challenging reel weights and supports database item prize categories", () => {
  assert.deepEqual(HAUNTED_CASINO_BETS, [10, 25, 50, 100, 250]);
  assert.deepEqual(
    HAUNTED_SLOT_SYMBOL_WEIGHTS.map((entry) => entry.id),
    ["coin", "essence", "edible", "fish", "loot", "skull"],
  );
  assert.ok((HAUNTED_SLOT_SYMBOL_WEIGHTS.find((entry) => entry.id === "loot")?.weight ?? 99) < (HAUNTED_SLOT_SYMBOL_WEIGHTS.find((entry) => entry.id === "edible")?.weight ?? 0));
  assert.ok((HAUNTED_SLOT_SYMBOL_WEIGHTS.find((entry) => entry.id === "skull")?.weight ?? 99) < (HAUNTED_SLOT_SYMBOL_WEIGHTS.find((entry) => entry.id === "coin")?.weight ?? 0));

  const jackpot = evaluateHauntedSlotResult(["skull", "skull", "skull"], 25);
  assert.equal(jackpot.tier, "jackpot");
  assert.equal(jackpot.coins, 250);
  assert.equal(jackpot.essence, 125);
  assert.equal(jackpot.pvpTickets, 5);

  const edible = evaluateHauntedSlotResult(["edible", "edible", "edible"], 50);
  assert.equal(edible.tier, "triple");
  assert.equal(edible.itemCategory, "edible");

  const fish = evaluateHauntedSlotResult(["fish", "fish", "fish"], 50);
  assert.equal(fish.itemCategory, "fish");

  const loot = evaluateHauntedSlotResult(["loot", "loot", "loot"], 50);
  assert.equal(loot.itemCategory, "loot");
  assert.equal(loot.coins, 100);

  const pair = evaluateHauntedSlotResult(["coin", "coin", "edible"], 100);
  assert.equal(pair.tier, "pair");
  assert.equal(pair.coins, 125);

  const secret = evaluateHauntedSlotResult(["coin", "essence", "skull"], 25);
  assert.equal(secret.tier, "combo");
  assert.equal(secret.coins, 50);
  assert.equal(secret.essence, 50);

  const miss = evaluateHauntedSlotResult(["coin", "edible", "fish"], 25);
  assert.equal(miss.tier, "miss");
  assert.equal(miss.coins, 0);
  assert.equal(miss.essence, 0);
});

test("Casino background reconcile points the stable location at HauntedCasinoMainBG", () => {
  const source = fs.readFileSync("server/worlds/hauntedWoods.ts", "utf8");
  assert.match(source, /HAUNTED_CASINO_BACKGROUND_PATH = "uploads\/HauntedCasinoMainBG\.png"/);
  assert.match(source, /casinoBackgroundUrl = versionedWorldAssetUrl\(HAUNTED_CASINO_BACKGROUND_PATH\)/);
  assert.match(source, /SET name = 'Haunted Casino',[\s\S]*bg_url = \$\{casinoBackgroundUrl\}/);
});

test("Casino runtime keeps player circles invisible while exposing admin drag and resize controls", () => {
  const runtime = fs.readFileSync("client/src/components/world/HauntedCasinoRuntime.tsx", "utf8");
  assert.match(runtime, /haunted-casino-hotspot-\$\{spot\.id\}/);
  assert.match(runtime, /data-casino-admin=\{isAdmin \? "true" : "false"\}/);
  assert.match(runtime, /border: isAdmin \?/);
  assert.match(runtime, /background: isAdmin \?/);
  assert.match(runtime, /setPointerCapture/);
  assert.match(runtime, /Make \$\{spot\.label\} hotspot smaller/);
  assert.match(runtime, /Make \$\{spot\.label\} hotspot larger/);
  assert.match(runtime, /\/api\/admin\/haunted-casino\/hotspots/);
  assert.match(runtime, />opening soon</);
  assert.match(runtime, /spot\.id === "slots"/);
});

test("Casino floor has an iOS-safe horizontal pan fallback that does not turn swipes into hotspot taps", () => {
  const runtime = fs.readFileSync("client/src/components/world/HauntedCasinoRuntime.tsx", "utf8");
  const worldLocations = fs.readFileSync("client/src/components/world/WorldLocations.tsx", "utf8");
  assert.match(worldLocations, /data-testid="haunted-casino-scroll-view"/);
  assert.match(worldLocations, /overflow-x-auto overflow-y-hidden/);
  assert.match(worldLocations, /WebkitOverflowScrolling: "touch"/);
  assert.match(runtime, /function installCasinoPanFallback/);
  assert.match(runtime, /scroller\.scrollLeft = startScrollLeft - dx/);
  assert.match(runtime, /touchmove", onTouchMove, \{ passive: false \}/);
  assert.match(runtime, /if \(event\.cancelable\) event\.preventDefault\(\)/);
  assert.match(runtime, /suppressClickAfterPan/);
  assert.match(runtime, /Date\.now\(\) - lastPanAt > 320/);
  assert.match(runtime, /isAdminHotspotTarget/);
});

test("Slaughter Slots uses the standalone essence token and translucent purple reel glass", () => {
  const client = fs.readFileSync("client/src/components/world/SlaughterSlotsOverlay.tsx", "utf8");
  const currencyAssets = fs.readFileSync("client/src/lib/currencyAssets.ts", "utf8");
  assert.match(client, /currencyAssets\.essenceToken/);
  assert.match(currencyAssets, /essenceToken/);
  assert.match(currencyAssets, /23958_PM_1783626016795\.png/);
  assert.match(client, /rgba\(105,45,158,\.52\)/);
  assert.match(client, /backdrop-blur-\[3px\]/);
  assert.doesNotMatch(client, /bg-\[#e8dcc6\]/i);
});

test("Slaughter Slots separates spin, hold limit, and bet controls clearly", () => {
  const client = fs.readFileSync("client/src/components/world/SlaughterSlotsOverlay.tsx", "utf8");
  for (const filename of ASSETS.slice(1, -1)) assert.match(client, new RegExp(filename.replace(".", "\\.")));
  assert.match(client, /top: "60\.2%"/);
  assert.match(client, /Spin once, or hold to keep spinning/);
  assert.match(client, /\{spinning \? "SPINNING" : "SPIN"\}/);
  assert.match(client, /Tap once · hold to repeat/);
  assert.match(client, />Hold limit</);
  assert.match(client, /Maximum coins to spend while holding/);
  assert.match(client, /onPointerDown=\{beginHold\}/);
  assert.match(client, /gross-wager safety limit/);
  assert.match(client, /holdSpentRef\.current \+= stake/);
  assert.match(client, /top: "71\.25%"/);
  assert.match(client, /aria-label="Decrease bet"/);
  assert.match(client, /aria-label="Increase bet"/);
  assert.match(client, /Max wager reached/);
  assert.doesNotMatch(client, /change MAX before holding/);
});

test("Slaughter Slots raises reel content and uses a slower staged stop", () => {
  const client = fs.readFileSync("client/src/components/world/SlaughterSlotsOverlay.tsx", "utf8");
  assert.match(client, /top: "28%"/);
  assert.match(client, /REEL_TICK_MS = 120/);
  assert.match(client, /MINIMUM_ROLL_MS = 1700/);
  assert.match(client, /REEL_STOP_DELAY_MS = 240/);
  assert.match(client, /Stop the reels from left to right/);
  assert.match(client, /slaughterSymbolRoll/);
  assert.doesNotMatch(client, /}, 72\);/);
  assert.doesNotMatch(client, /Math\.max\(0, 900 -/);
});

test("Slaughter Slots wagers and payouts use the player's real global coin wallet", () => {
  const server = fs.readFileSync("server/hauntedCasino.ts", "utf8");
  const routes = fs.readFileSync("server/routes/hauntedCasino.routes.ts", "utf8");
  assert.match(server, /SELECT coins, essence FROM users WHERE id = \$\{userId\}/);
  assert.match(server, /FOR UPDATE/);
  assert.match(server, /UPDATE users[\s\S]*coins = coins - \$\{bet\} \+ \$\{reward\.coins\}/);
  assert.match(server, /no casino-only balance/i);
  assert.match(routes, /\/api\/haunted-casino\/slots\/spin/);
  assert.match(routes, /spinHauntedSlots\(user\.id, req\.body\?\.bet\)/);
  assert.doesNotMatch(routes, /req\.body\?\.(?:reward|reels|itemId|shopItemId)/);
});

test("Casino item prizes come from the live catalog, exclude pets and eggs, and sharply weight down rare items", () => {
  const server = fs.readFileSync("server/hauntedCasino.ts", "utf8");
  assert.match(server, /FROM shop_items/);
  assert.match(server, /type <> 'pet'/);
  assert.match(server, /pet_template_id IS NULL/);
  assert.match(server, /egg_image_url IS NULL/);
  assert.match(server, /hatch_time IS NULL/);
  assert.match(server, /type = 'fishing' AND COALESCE\(fishing_type, ''\) <> 'fish'/);
  assert.match(server, /item\.type === "edibles"/);
  assert.match(server, /item\.fishing_type === "fish"/);
  assert.match(server, /\[0, 100, 45, 18, 6, 2\]\[rarity\]/);
  assert.match(server, /price >= 1000/);
  assert.match(server, /pickPrizeItem/);
  assert.match(server, /grantPrizeItem/);
});
