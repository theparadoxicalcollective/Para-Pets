import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bingo = readFileSync("client/src/components/world/HauntedBingoOverlay.tsx", "utf8");
const bingoCss = readFileSync("client/src/components/world/HauntedBingoOverlay.css", "utf8");
const bingoEconomyCss = readFileSync("client/src/components/world/HauntedBingoEconomy.css", "utf8");
const bingoPolishCss = readFileSync("client/src/components/world/HauntedBingoPolish.css", "utf8");
const casinoMobilePolishCss = readFileSync("client/src/components/world/CasinoMobilePolish.css", "utf8");
const casinoRuntime = readFileSync("client/src/components/world/HauntedCasinoRuntime.tsx", "utf8");
const bingoServer = readFileSync("server/hauntedBingo.ts", "utf8");
const casinoRoutes = readFileSync("server/routes/hauntedCasino.routes.ts", "utf8");
const bingoMigration = readFileSync("server/startup/migrations/ensureHauntedBingo.ts", "utf8");

test("Bingo hotspot opens the playable Bingo overlay instead of Opening Soon", () => {
  assert.match(casinoRuntime, /import HauntedBingoOverlay from "\.\/HauntedBingoOverlay"/);
  assert.match(casinoRuntime, /const \[bingoOpen, setBingoOpen\] = useState\(false\)/);
  assert.match(casinoRuntime, /spot\.id === "bingo"[\s\S]*?setBingoOpen\(true\)/);
  assert.match(casinoRuntime, /bingoOpen && createPortal\([\s\S]*?<HauntedBingoOverlay onClose=\{\(\) => \{ setBingoOpen\(false\); refreshFreePlay\(\); \}\}/);
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
  assert.match(bingo, /haunted-bingo-cage-wallet/);
});

test("Bingo economy remains server authoritative with one free daily card, 100 coin replays, and 500 coin wins", () => {
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

test("Coin balance sits under the cage and call-stand helper text is removed", () => {
  assert.match(bingo, /haunted-bingo-cage-zone[\s\S]*?haunted-bingo-cage-wallet[\s\S]*?haunted-bingo-wallet/);
  assert.doesNotMatch(bingo, /className="haunted-bingo-economy-strip"/);
  assert.doesNotMatch(bingo, /haunted-bingo-call-caption/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-wallet[\s\S]*?font-size:\s*10\.5px/);
});

test("Random card bonuses stay ghosted, shift down-right in the base skin, and only pay when marked at Bingo", () => {
  assert.match(bingoServer, /HAUNTED_BINGO_BONUS_COUNT = 3/);
  assert.match(bingoServer, /const BONUS_VALUES = \[25, 25, 50, 50, 75, 100, 150\]/);
  assert.match(bingoServer, /bonuses\.filter\(\(bonus\) => marked\.has\(bonus\.key\)\)/);
  assert.match(bingo, /haunted-bingo-bonus/);
  assert.match(bingo, /currencyAssets\.coin/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-bonus[\s\S]*?transform:\s*translate\(4%, 4%\)/);
  assert.match(bingoPolishCss, /\.haunted-bingo-bonus[\s\S]*?transform:\s*none/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-bonus img[\s\S]*?opacity:\s*\.18/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-bonus\.is-collected b[\s\S]*?opacity:\s*1/);
});

test("Bingo close control shrinks, covered markers move down, and called numbers sparkle", () => {
  assert.match(bingo, /haunted-bingo-header haunted-bingo-header-spacer/);
  assert.doesNotMatch(bingo, /<h1>Haunted Bingo<\/h1>/);
  assert.match(bingo, /FREE GAME/);
  assert.match(bingo, /PLAY FOR \$\{state\?\.entryCost \?\? 100\} COINS/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-close[\s\S]*?width:\s*clamp\(34px, 8\.8vw, 44px\)/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-cell\.is-marked::before[\s\S]*?inset:\s*14% 9% 4% 9%/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-cell\.is-called:not\(\.is-marked\)::after[\s\S]*?border:\s*0[\s\S]*?radial-gradient/);
  assert.match(bingoEconomyCss, /@keyframes haunted-bingo-called-sparkle/);
});

test("Main Bingo card stays shifted while call history and top artwork use global polish offsets", () => {
  assert.match(bingo, /AUTO_CALL_START_MS = 3200/);
  assert.match(bingo, /AUTO_CALL_END_MS = 2200/);
  assert.match(bingo, /autoCallDelay\(round\.called\.length\)/);
  assert.match(bingo, /slice\(-8\)/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-card[\s\S]*?width:\s*min\(84vw, 372px\)[\s\S]*?transform:\s*translateX\(-6\.5vw\)/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-history[\s\S]*?left:\s*50%[\s\S]*?bottom:\s*-20px[\s\S]*?translateX\(-50%\)/);
  assert.match(bingoPolishCss, /\.haunted-bingo-cage,[\s\S]*?translate:\s*16px 0/);
  assert.match(bingoPolishCss, /\.haunted-bingo-call-zone[\s\S]*?translate:\s*-24px 0/);
  assert.match(bingoPolishCss, /\.haunted-bingo-history[\s\S]*?translate:\s*0 -16px/);
  assert.match(bingoEconomyCss, /justify-content:\s*center/);
  assert.match(casinoMobilePolishCss, /\.haunted-bingo-stage\.is-idle \.haunted-bingo-card-zone[\s\S]*?padding-right:\s*0/);
  assert.match(casinoMobilePolishCss, /\.haunted-bingo-stage\.is-idle \.haunted-bingo-card[\s\S]*?margin-left:\s*auto[\s\S]*?transform:\s*none/);
  assert.match(casinoMobilePolishCss, /\.haunted-bingo-cage-wallet[\s\S]*?width:\s*calc\(100vw - 20px\)[\s\S]*?justify-content:\s*center/);
  assert.match(bingoEconomyCss, /haunted-bingo-call-ticker-in/);
});

test("Every Bingo round races five server-owned rivals but still closes after the first three winners", () => {
  assert.match(bingoServer, /HAUNTED_BINGO_RIVAL_COUNT = 5/);
  assert.match(bingoServer, /HAUNTED_BINGO_WINNER_LIMIT = 3/);
  assert.match(bingoServer, /completeHauntedBingoRivals/);
  assert.match(bingoServer, /advanceHauntedBingoRivals/);
  assert.match(bingoServer, /roundFinished = fieldFilled \|\| remaining\.length === 0/);
  assert.match(bingoServer, /status = \$\{roundFinished \? "lost" : "active"\}/);
  assert.match(bingoServer, /winners\.length < HAUNTED_BINGO_WINNER_LIMIT/);
  assert.match(bingoMigration, /ADD COLUMN IF NOT EXISTS rivals JSONB/);
  assert.match(bingoMigration, /ADD COLUMN IF NOT EXISTS winner_order JSONB/);
  assert.match(bingoMigration, /'active', 'won', 'lost', 'forfeited'/);
});

test("Five rival mini cards remain in a separate rail from the shifted main card", () => {
  assert.match(bingo, /className="haunted-bingo-rivals"/);
  assert.match(bingo, /TOP \{winnerLimit\} WIN/);
  assert.match(bingo, /RivalMiniCard/);
  assert.match(bingo, /rivalCount = state\?\.rivalCount \?\? 5/);
  assert.match(bingo, /OUT OF PRIZE SPOTS/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-rivals[\s\S]*?position:\s*absolute/);
  assert.match(bingoEconomyCss, /\.haunted-bingo-rival\.is-won/);
  assert.match(bingoEconomyCss, /haunted-bingo-rival-sheen/);
});

test("Active Bingo cards expire instead of being held indefinitely", () => {
  assert.match(bingoServer, /HAUNTED_BINGO_ROUND_DURATION_MS = 5 \* 60 \* 1000/);
  assert.match(bingoServer, /created_at <= now\(\) - interval '5 minutes'/);
  assert.match(bingoServer, /SET status = 'forfeited'/);
  assert.match(bingo, /TIME \{formatRoundTime\(roundSecondsRemaining\)\}/);
  assert.match(bingo, /clock keeps running if you leave/);
  assert.doesNotMatch(bingo, /New Card/);
});

test("Bingo adds transparent pressure feedback without changing server-owned odds", () => {
  assert.match(bingo, /bingoMarksNeeded/);
  assert.match(bingo, /ONE AWAY/);
  assert.match(bingo, /calledUnmarkedCount/);
  assert.match(bingo, /is-threatening/);
  assert.match(bingoPolishCss, /haunted-bingo-rival-threat/);
  assert.match(bingo, /Auto Call gradually speeds up/);
});

test("Closing Bingo returns to the casino overlay instead of reloading back to the world", () => {
  assert.match(casinoRuntime, /<HauntedBingoOverlay onClose=\{\(\) => \{ setBingoOpen\(false\); refreshFreePlay\(\); \}\}/);
  assert.match(bingo, /const closeBingo = \(\) => \{[\s\S]*?setAutoCall\(false\);[\s\S]*?onClose\(\);[\s\S]*?\};/);
  assert.doesNotMatch(bingo, /window\.location\.reload/);
  assert.match(bingo, /queryClient\.setQueryData\(\["\/api\/auth\/me"\]/);
});
