import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_HAUNTED_CASINO_HOTSPOTS,
  HAUNTED_CASINO_BETS,
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

test("Slaughter Slots payout table rewards matches without making every spin a win", () => {
  assert.deepEqual(HAUNTED_CASINO_BETS, [10, 25, 50, 100, 250]);

  const jackpot = evaluateHauntedSlotResult(["skull", "skull", "skull"], 25);
  assert.equal(jackpot.tier, "jackpot");
  assert.equal(jackpot.coins, 250);
  assert.equal(jackpot.essence, 125);
  assert.equal(jackpot.pvpTickets, 5);

  const koi = evaluateHauntedSlotResult(["koi", "koi", "koi"], 50);
  assert.equal(koi.itemName, "Red Mood Koi");
  assert.equal(koi.coins, 150);

  const pair = evaluateHauntedSlotResult(["coin", "coin", "potion"], 100);
  assert.equal(pair.tier, "pair");
  assert.equal(pair.coins, 125);

  const secret = evaluateHauntedSlotResult(["coin", "essence", "skull"], 25);
  assert.equal(secret.tier, "combo");
  assert.equal(secret.coins, 50);
  assert.equal(secret.essence, 50);

  const miss = evaluateHauntedSlotResult(["coin", "potion", "koi"], 25);
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
  assert.match(runtime, /border: isAdmin \?/);
  assert.match(runtime, /background: isAdmin \?/);
  assert.match(runtime, /setPointerCapture/);
  assert.match(runtime, /Make \$\{spot\.label\} hotspot smaller/);
  assert.match(runtime, /Make \$\{spot\.label\} hotspot larger/);
  assert.match(runtime, /\/api\/admin\/haunted-casino\/hotspots/);
  assert.match(runtime, />opening soon</);
  assert.match(runtime, /spot\.id === "slots"/);
});

test("Casino runtime mounts over the existing full-height horizontal scroller", () => {
  const nav = fs.readFileSync("client/src/lib/navVisibility.ts", "utf8");
  const worldLocations = fs.readFileSync("client/src/components/world/WorldLocations.tsx", "utf8");
  assert.match(nav, /enhanceHauntedCasinoRoot/);
  assert.match(worldLocations, /data-testid="haunted-casino-scroll-view"/);
  assert.match(worldLocations, /overflow-x-auto overflow-y-hidden/);
  assert.match(worldLocations, /className="block h-full w-auto max-w-none mx-auto select-none"/);
});

test("Slaughter Slots uses the supplied machine controls and server-authoritative spin endpoint", () => {
  const client = fs.readFileSync("client/src/components/world/SlaughterSlotsOverlay.tsx", "utf8");
  const server = fs.readFileSync("server/hauntedCasino.ts", "utf8");
  const routes = fs.readFileSync("server/routes/hauntedCasino.routes.ts", "utf8");

  for (const filename of ASSETS.slice(1)) assert.match(client, new RegExp(filename.replace(".", "\\.")));
  assert.match(client, /top: "max\(24px, calc\(env\(safe-area-inset-top\) \+ 12px\)\)"/);
  assert.match(client, /There is no auto-spin|there is no auto-spin/i);
  assert.match(routes, /\/api\/haunted-casino\/slots\/spin/);
  assert.match(server, /crypto\.randomInt/);
  assert.match(server, /FOR UPDATE/);
  assert.match(server, /coins = coins - \$\{bet\} \+ \$\{reward\.coins\}/);
  assert.match(server, /Red Mood Koi/);
  assert.match(server, /PVP_TICKET_CAP = 100/);
});
