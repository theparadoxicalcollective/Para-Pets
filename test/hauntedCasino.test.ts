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
  assert.deepEqual(HAUNTED_CASINO_BETS, [50, 100, 500, 1000, 5000]);
  assert.deepEqual(
    HAUNTED_SLOT_SYMBOL_WEIGHTS.map((entry) => entry.id),
    ["coin", "essence", "edible", "egg", "loot", "ginny", "skull"],
  );
  assert.ok((HAUNTED_SLOT_SYMBOL_WEIGHTS.find((entry) => entry.id === "loot")?.weight ?? 99) < (HAUNTED_SLOT_SYMBOL_WEIGHTS.find((entry) => entry.id === "edible")?.weight ?? 0));
  assert.ok((HAUNTED_SLOT_SYMBOL_WEIGHTS.find((entry) => entry.id === "skull")?.weight ?? 99) < (HAUNTED_SLOT_SYMBOL_WEIGHTS.find((entry) => entry.id === "coin")?.weight ?? 0));

  const jackpot = evaluateHauntedSlotResult(["skull", "skull", "skull"], 50);
  assert.equal(jackpot.tier, "jackpot");
  assert.equal(jackpot.coins, 500);
  assert.equal(jackpot.essence, 250);
  assert.equal(jackpot.pvpTickets, 0);

  const skullPair = evaluateHauntedSlotResult(["skull", "skull", "coin"], 50);
  assert.equal(skullPair.tier, "pair");
  assert.equal(skullPair.essence, 100);
  assert.equal(skullPair.pvpTickets, 0);
  assert.doesNotMatch(skullPair.message, /ticket/i);

  const edible = evaluateHauntedSlotResult(["edible", "edible", "edible"], 50);
  assert.equal(edible.tier, "triple");
  assert.equal(edible.itemCategory, "edible");

  const egg = evaluateHauntedSlotResult(["egg", "egg", "egg"], 50);
  assert.equal(egg.itemCategory, "egg");

  const loot = evaluateHauntedSlotResult(["loot", "loot", "loot"], 50);
  assert.equal(loot.itemCategory, "loot");
  assert.equal(loot.coins, 100);

  const pair = evaluateHauntedSlotResult(["coin", "coin", "edible"], 100);
  assert.equal(pair.tier, "pair");
  assert.equal(pair.coins, 125);

  const secret = evaluateHauntedSlotResult(["coin", "essence", "skull"], 50);
  assert.equal(secret.tier, "combo");
  assert.equal(secret.coins, 100);
  assert.equal(secret.essence, 100);

  const miss = evaluateHauntedSlotResult(["coin", "edible", "egg"], 50);
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
  assert.match(runtime, /casino-slots-free-indicator[\s\S]*?leading-none/);
  assert.match(runtime, /casino-bingo-free-indicator[\s\S]*?leading-none/);
  assert.match(runtime, /-translate-y-px/);
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

test("Slaughter Slots raises bet and spin controls one notch", () => {
  const client = fs.readFileSync("client/src/components/world/SlaughterSlotsOverlay.tsx", "utf8");
  for (const filename of ASSETS.slice(1, -1)) assert.match(client, new RegExp(filename.replace(".", "\\.")));
  assert.match(client, /data-testid="slaughter-slots-bet-control"[\s\S]*?top: "63%"/);
  assert.match(client, /data-testid="slaughter-slots-spin-control"[\s\S]*?top: "72\.5%"/);
  assert.match(client, /Spin once, or hold to keep spinning/);
  assert.match(client, /\{holding \? "STOP AUTO" : spinning \? "SPINNING" : "SPIN"\}/);
  assert.match(client, /Tap once · hold for auto/);
  assert.match(client, /onPointerDown=\{beginHold\}/);
  assert.match(client, /aria-label="Decrease bet"/);
  assert.match(client, /aria-label="Increase bet"/);
  assert.doesNotMatch(client, /Hold limit|Maximum coins to spend while holding|gross-wager safety limit|holdSpentRef|budgetLimitRef|MAX must be/);
});

test("Slaughter Slots uses a more readable staged spin", () => {
  const client = fs.readFileSync("client/src/components/world/SlaughterSlotsOverlay.tsx", "utf8");
  assert.match(client, /top: "28%"/);
  assert.match(client, /REEL_TICK_MS = 150/);
  assert.match(client, /MINIMUM_ROLL_MS = 2200/);
  assert.match(client, /REEL_STOP_DELAY_MS = 300/);
  assert.match(client, /slaughterSymbolRoll \.32s linear infinite/);
  assert.match(client, /Stop the reels from left to right/);
  assert.match(client, /slaughterSymbolRoll/);
  assert.doesNotMatch(client, /}, 72\);/);
  assert.doesNotMatch(client, /Math\.max\(0, 900 -/);
  assert.match(client, /slaughterHandlePull \.78s cubic-bezier\(\.25,\.8,\.25,1\) 1/);
  assert.doesNotMatch(client, /slaughterHandlePull[^"\n]*infinite/);
});

test("Slaughter Slots close returns to the casino without click-through", () => {
  const client = fs.readFileSync("client/src/components/world/SlaughterSlotsOverlay.tsx", "utf8");
  const runtime = fs.readFileSync("client/src/components/world/HauntedCasinoRuntime.tsx", "utf8");
  assert.match(runtime, /onClose=\{\(\) => \{ setSlotsOpen\(false\); refreshFreePlay\(\); \}\}/);
  assert.match(client, /aria-label="Close Slaughter Slots"[\s\S]*?onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(client, /event\.preventDefault\(\); event\.stopPropagation\(\); stopHold\(\); onClose\(\)/);
});

test("Slaughter Slots keeps its logo, machine, and controls inside the viewport", () => {
  const client = fs.readFileSync("client/src/components/world/SlaughterSlotsOverlay.tsx", "utf8");
  assert.match(client, /overflow-hidden bg-\[#08040d\]/);
  assert.match(client, /data-testid="slaughter-slots-machine-stage"/);
  assert.match(client, /var\(--fh, 100dvh\) - 228px/);
  assert.match(client, /data-testid="slaughter-slots-winnings-area"/);
  assert.match(client, /width: "94%"/);
  assert.match(client, /transform: "translate\(-50%, -8%\)"/);
  assert.doesNotMatch(client, /overflow-y-auto bg-\[#08040d\]/);
});

test("Slaughter Slots wagers and payouts use the player's real global coin wallet", () => {
  const server = fs.readFileSync("server/hauntedCasino.ts", "utf8");
  const routes = fs.readFileSync("server/routes/hauntedCasino.routes.ts", "utf8");
  assert.match(server, /SELECT coins, essence FROM users WHERE id = \$\{userId\}/);
  assert.match(server, /FOR UPDATE/);
  assert.match(server, /UPDATE users[\s\S]*coins = coins - \$\{cost\} \+ \$\{reward\.coins\}/);
  assert.match(server, /no casino-only balance/i);
  assert.match(routes, /\/api\/haunted-casino\/slots\/spin/);
  assert.match(routes, /spinHauntedSlots\(user\.id, req\.body\?\.bet, req\.body\?\.useFreeSpin === true\)/);
  assert.doesNotMatch(routes, /req\.body\?\.(?:reward|reels|itemId|shopItemId)/);
});

test("decorative prizes keep the original machine sizing and footer footprint", () => {
  const client = fs.readFileSync("client/src/components/world/SlaughterSlotsOverlay.tsx", "utf8");
  const strip = fs.readFileSync("client/src/components/world/SlotPrizeStrip.tsx", "utf8");
  assert.match(client, /maxWidth: 520, width: "min\(100%, calc\(\(var\(--fh, 100dvh\) - 228px/);
  assert.doesNotMatch(client, /var\(--fh, 100dvh\) - 340px/);
  assert.match(client, /data-testid="slaughter-slots-footer"[^\n]*height: 112/);
  assert.match(client, /data-testid="slaughter-slots-winnings-area"[^\n]*absolute inset-x-0 bottom-20/);
  assert.match(strip, /absolute inset-x-0 bottom-0 h-\[72px\]/);
  assert.match(strip, /slot-prize-coin-image/);
  assert.match(strip, /slot-prize-essence-image/);
  assert.match(strip, /currencyAssets\.coin/);
  assert.match(strip, /currencyAssets\.essenceToken/);
  assert.doesNotMatch(strip, /PvP tickets|currency-tickets/);
  assert.match(strip, /\.\.\.prizes\.map/);
  assert.match(strip, /scrollbarWidth: "none"/);
  assert.match(strip, /::-webkit-scrollbar \{ display: none/);
  assert.match(strip, /overflow-x-auto/);
  assert.doesNotMatch(strip, /<button|setPaused|Pause scrolling|Resume scrolling|onFocus=/);
  assert.match(strip, /requestAnimationFrame\(advance\)/);
  assert.match(strip, /cancelAnimationFrame\(frame\)/);
  assert.match(strip, /prefers-reduced-motion: reduce/);
  assert.match(strip, /position = scroller.scrollLeft/);
});

test("Casino item and egg pools are separate, and rare prizes retain their weighting", () => {
  const server = fs.readFileSync("server/hauntedCasino.ts", "utf8");
  const prizes = fs.readFileSync("server/hauntedSlotPrizes.ts", "utf8");
  assert.match(prizes, /FROM shop_items/);
  assert.match(prizes, /type <> 'pet'/);
  assert.match(prizes, /pet_template_id IS NULL/);
  assert.match(prizes, /egg_image_url IS NULL/);
  assert.match(prizes, /hatch_time IS NULL/);
  assert.match(prizes, /id <> \$\{PVP_TICKET_ITEM_ID\}/);
  assert.match(prizes, /lower\(name\) NOT LIKE '%ticket%'/);
  assert.doesNotMatch(prizes, /image_url IS NOT NULL/);
  assert.match(prizes, /type = 'fishing' AND COALESCE\(fishing_type, ''\) <> 'fish'/);
  assert.match(prizes, /item\.type === "edibles"/);
  assert.match(prizes, /item\.type === "pet"/);
  assert.match(server, /\[0, 100, 45, 18, 6, 2\]\[rarity\]/);
  assert.match(server, /effectiveSlotItemRarity\(item\) >= 3/);
  assert.match(server, /bet >= 1000/);
  assert.match(server, /randomInt\(10\) < 9 \? common : rare/);
  assert.match(server, /pickPrizeItem/);
  assert.match(server, /grantPrizeItem/);
});

test("admin slot prize editor reopens with saved selections and refreshes the public prize strip", () => {
  const dialog = fs.readFileSync("client/src/components/world/SlotPrizeAdminDialog.tsx", "utf8");
  const slots = fs.readFileSync("client/src/components/world/SlaughterSlotsOverlay.tsx", "utf8");
  assert.match(dialog, /data-testid="slot-current-prizes"/);
  assert.match(dialog, /setSelected\(new Set\(ids\)\)/);
  assert.match(dialog, /Currently selected/);
  assert.match(dialog, /selectedOptions\.map/);
  assert.match(dialog, /optionById\.has\(id\)/);
  assert.match(slots, /onSaved=\{refreshAuthoritativeState\}/);
  assert.match(slots, /const data = await response\.json\(\) as SlotState/);
  assert.match(slots, /applyState\(data\)/);
});

test("higher stakes scale currency payouts without increasing reel odds", () => {
  for (const bet of HAUNTED_CASINO_BETS) {
    const triple = evaluateHauntedSlotResult(["coin", "coin", "coin"], bet);
    const pair = evaluateHauntedSlotResult(["coin", "coin", "skull"], bet);
    assert.equal(triple.coins, bet * 5);
    assert.equal(pair.coins, Math.ceil(bet * 1.25));
    assert.equal(evaluateHauntedSlotResult(["skull", "skull", "skull"], bet).essence, bet * 5);
  }
});
