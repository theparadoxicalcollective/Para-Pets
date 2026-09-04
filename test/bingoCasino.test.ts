import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bingo = readFileSync("client/src/components/world/HauntedBingoOverlay.tsx", "utf8");
const bingoCss = readFileSync("client/src/components/world/HauntedBingoOverlay.css", "utf8");
const casinoRuntime = readFileSync("client/src/components/world/HauntedCasinoRuntime.tsx", "utf8");

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

  assert.match(bingo, /Array\.from\(\{ length: 75 \}, \(_, index\) => index \+ 1\)/);
  assert.match(bingo, /const start = columnIndex \* 15 \+ 1/);
  assert.match(bingo, /rowIndex === 2 && columnIndex === 2 \? null/);
  assert.match(bingo, /function hasBingo\(/);
});

test("Bingo keeps the shuffled balls behind the cage artwork and stays responsive", () => {
  assert.match(bingoCss, /\.haunted-bingo-cage-balls[\s\S]*?z-index:\s*1/);
  assert.match(bingoCss, /\.haunted-bingo-cage-frame[\s\S]*?z-index:\s*2/);
  assert.match(bingoCss, /@media \(max-width: 700px\)/);
  assert.match(bingoCss, /grid-template-areas:\s*\n\s*"cage call"\s*\n\s*"card card"/);
  assert.match(bingoCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(bingoCss, /\.haunted-bingo-card-grid/);
});

test("Initial Bingo implementation is free play and does not mutate the casino wallet", () => {
  assert.match(bingo, /Free play/);
  assert.doesNotMatch(bingo, /fetch\(/);
});
