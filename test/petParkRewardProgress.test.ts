import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parkNextRewardProgress } from "../client/src/lib/petParkRewardProgress";

const checkpoint = "2026-11-05T12:00:00.000Z";
const rates = { coinsPerHour: 60, essencePerHour: 24, petXpPerHour: 300 };
const timing = { checkpointAt: checkpoint, pausedAt: null, pausedDurationMs: 0, earnedDurationMs: 0 };

test("reward bars represent real next-unit cycles with different rates", () => {
  const start = Date.parse(checkpoint);
  const coins = parkNextRewardProgress("coins", timing, rates, start + 30_000);
  assert.equal(coins.nextUnits, 1);
  assert.equal(coins.progress, 0.5);
  assert.equal(coins.secondsRemaining, 30);

  const essence = parkNextRewardProgress("essence", timing, rates, start + 150_000);
  assert.equal(essence.nextUnits, 2, "24 essence per hour pays as 2/5 minutes");
  assert.equal(essence.progress, 0.5);
  assert.equal(essence.secondsRemaining, 150);

  const xp = parkNextRewardProgress("petXp", timing, rates, start + 6_000);
  assert.equal(xp.nextUnits, 1);
  assert.equal(xp.progress, 0.5);
  assert.equal(xp.secondsRemaining, 6);
});

test("collecting rewards preserves fractional bar progress through the reward ledger", () => {
  const start = Date.parse(checkpoint);
  const beforeClaim = parkNextRewardProgress("coins", timing, rates, start + 90_000);
  const afterClaim = parkNextRewardProgress("coins", {
    ...timing, checkpointAt: new Date(start + 60_000).toISOString(), earnedDurationMs: 60_000,
  }, rates, start + 90_000);
  assert.equal(beforeClaim.progress, afterClaim.progress);
  assert.equal(afterClaim.progress, 0.5);
});

test("closed parks pause reward movement; zero rates show inactive bars", () => {
  const start = Date.parse(checkpoint);
  const paused = { ...timing, pausedAt: new Date(start + 45_000).toISOString() };
  const first = parkNextRewardProgress("coins", paused, rates, start + 80_000);
  const later = parkNextRewardProgress("coins", paused, rates, start + 300_000);
  assert.equal(first.progress, later.progress);
  assert.equal(first.paused, true);
  const disabled = parkNextRewardProgress("essence", timing, { ...rates, essencePerHour: 0 }, start + 60_000);
  assert.equal(disabled.disabled, true);
  assert.equal(disabled.progress, 0);
});

test("park's visual rewards are only in the open equipped oval panel, with quiet successes", () => {
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const bars = readFileSync("client/src/components/PetParkRewardBars.tsx", "utf8");
  const css = readFileSync("client/src/index.css", "utf8");
  const server = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
  assert.match(page, /<PetParkRewardBars timing=\{pet\}/);
  assert.match(page, /slotTapEffect\?\.slot === slot/);
  assert.match(page, /aria-label=\{`Pet Park spot \$\{slot\}`\}/);
  assert.match(bars, /aria-label="Pet Park reward progress"/);
  assert.match(bars, /name: "Coins"/);
  assert.match(bars, /name: "Essence"/);
  assert.match(bars, /name: "Pet XP"/);
  assert.match(css, /pet-park-oval-spark/);
  assert.doesNotMatch(page, /toast\(\{ title: "Pet equipped"/);
  assert.doesNotMatch(page, />\{building\.name\}<\/span>/);
  assert.match(server, /earnedDurationMs: sql<number>/);
  assert.match(server, /serverNow: new Date\(\)\.toISOString\(\)/);
});
