import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bingo = readFileSync("client/src/components/world/HauntedBingoOverlay.tsx", "utf8");
const bingoCss = readFileSync("client/src/components/world/HauntedBingoOverlay.css", "utf8");
const bingoEconomyCss = readFileSync("client/src/components/world/HauntedBingoEconomy.css", "utf8");
const casinoRuntime = readFileSync("client/src/components/world/HauntedCasinoRuntime.tsx", "utf8");
const bingoServer = readFileSync("server/hauntedBingo.ts", "utf8");
const casinoRoutes = readFileSync("server/routes/hauntedCasino.routes.ts", "utf8");
const bingoMigration = readFileSync("server/startup/migrations/ensureHauntedBingo.ts", "utf8");

test("Bingo hotspot opens the playable Bingo overlay instead of Opening Soon", () => {
  assert.match(casinoRuntime, /import HauntedBingoOverlay from "\.\/HauntedBingoOverlay"/);
  assert.match(casinoRuntime, /const \[bingoOpen, setBingoOpen\] = useState\(false\)/);
  assert.match(casinoRuntime, /spot\.id === "bingo"[\s\S]*?setBingoOpen\(true\)/);
  assert.match(casinoRuntime, /bingoOpen && createPortal\([\s\S]*?<HauntedBingoOverlay onClose=\{\(\) => setBingoOpen\(false\)\}/);
});

test("Bingo reuses the Haunted Casino background and supplied artwork", () => {
  for (const asset of [
    "HauntedCasinoMainBG.png",
    "BingoBall.png",
    "BingoBallCage.png",
    "BingoBallCallStand.png",
    "BlankBingoCard.png",
  ]) {
    assert.ok(bingo.includes(asset), `${asset} should be used by Haunted Bingo`);
  }

  assert.match(bingoCss, /\.haunted-bingo-cage-balls[\s\S]*?z-index:\s*1/);
  assert.match(bingoCss, /\.haunted-bingo-cage-frame[\s\S]*?z-index:\s*2/);
  assert.match(bingoCss, /@media \(max-width: 700px\)/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-bonus/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-economy-strip/);
});

test("Bingo economy is server authoritative with one free daily card, paid replays, and 500 coin wins", () => {
  assert.match(bingoServer, /HAUNTED_BINGO_ENTRY_COST = 100/);
  assert.match(bingoServer, /HAUNTED_BINGO_WIN_REWARD = 500/);
  assert.match(bingoServer, /HAUNTED_BINGO_DAILY_FREE_GAMES = 1/);
  assert.match(bingoServer, /UPDATE users[\s\S]*SET coins = coins - \$\{entryCost\}/);
  assert.match(bingoServer, /SET coins = coins \+ \$\{totalCoins\}/);
  assert.match(bingoServer, /total_coins_earned/);
  assert.match(bingoMigration, /haunted_bingo_daily_free_entry_uidx/);
  assert.match(bingoMigration, /haunted_bingo_one_active_round_uidx/);

  assert.match(casinoRoutes, /\/api\/haunted-casino\/bingo\/start/);
  assert.match(casinoRoutes, /\/api\/haunted-casino\/bingo\/:roundId\/call/);
  assert.match(casinoRoutes, /\/api\/haunted-casino\/bingo\/:roundId\/mark/);
  assert.doesNotMatch(bingo, /Math\.random/);
});

test("Random card bonuses are ghost coins and only become payout when marked at Bingo", () => {
  assert.match(bingoServer, /HAUNTED_BINGO_BONUS_COUNT = 3/);
  assert.match(bingoServer, /const BONUS_VALUES = \[25, 25, 50, 50, 75, 100, 150\]/);
  assert.match(bingoServer, /bonuses\.filter\(\(bonus\) => marked\.has\(bonus\.key\)\)/);
  assert.match(bingo, /haunted-bingo-bonus/);
  assert.match(bingo, /currencyAssets\.coin/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-bonus img[\s\S]*?opacity:\s*\.18/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-bonus\.is-collected b[\s\S]*?opacity:\s*1/);
});

test("Bingo visual tuning clears the header, keeps the card placement, and centers the call area", () => {
  assert.match(bingo, /haunted-bingo-header haunted-bingo-header-spacer/);
  assert.doesNotMatch(bingo, /<h1>Haunted Bingo<\/h1>/);
  assert.doesNotMatch(bingo, /Deal a card to begin/);
  assert.match(bingo, /FREE GAME/);
  assert.match(bingo, /PLAY FOR \$\{state\?\.entryCost \?\? 100\} COINS/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-cage[\s\S]*?width:\s*min\(30vw, 128px\)/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-call-zone[\s\S]*?left:\s*-14vw/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-called-ball[\s\S]*?top:\s*45\.5%/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-card[\s\S]*?width:\s*min\(84vw, 372px\)[\s\S]*?margin-top:\s*-8px/);
});

test("Auto call is calmer and recent calls tick left beneath the card", () => {
  assert.match(bingo, /AUTO_CALL_DELAY_MS = 2850/);
  assert.match(bingo, /slice\(-8\)/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-history[\s\S]*?position:\s*absolute[\s\S]*?bottom:\s*-20px/);
  assert.match(bingoEconomyCss, /justify-content:\s*flex-end/);
  assert.match(bingoEconomyCss, /haunted-bingo-call-ticker-in/);
});

test("Active Bingo cards persist instead of allowing free client-side rerolls", () => {
  assert.match(bingoServer, /WHERE user_id = \$\{userId\} AND status = 'active'/);
  assert.match(bingoServer, /FOR UPDATE/);
  assert.match(bingo, /Your active card is saved if you leave/);
  assert.doesNotMatch(bingo, /New Card/);
});
