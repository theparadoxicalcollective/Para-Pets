import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const editor = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const server = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");

test("closed Pet Park does not block admins, but keeps normal players behind under construction", () => {
  assert.match(page, /!scene\?\.enabledForPlayers && !scene\?\.canEditPark/);
  assert.match(page, /Admin preview · Park closed to players/);
  assert.match(page, /scene\?\.canEditPark && showCreator/);
  assert.match(page, /scene\?\.canEditPark && detailsBuilding/);
  assert.match(page, /Add Effects/);
  assert.match(page, /initialMode=\{editorMode\} mode="create"/);
  assert.doesNotMatch(page, /Advanced edit/);
});
test("admin settings and direct creation retain water effects, player access and explicit reward preset", () => {
  assert.match(editor, /mode: "create" \| "settings"/);
  assert.match(editor, /HOME_OUTDOOR_EFFECT_OPTIONS\.map\(option/);
  assert.match(editor, /WATER_EFFECT_OPTIONS\.map\(option/);
  assert.match(editor, /value: "sleep_spot", label: "Rest Spot"/);
  assert.match(page, /onPointerMove=\{movePlacement\}/);
  assert.match(editor, /aria-label="Allow players into Pet Park"/);
  assert.match(editor, /mode === "settings"/);
  assert.match(page, /Add Buildings/);
  assert.match(page, /Add Decor/);
  assert.match(editor, /coinsPerHour: 60, essencePerHour: 24, petXpPerHour: 300/);
  assert.match(editor, /Save reward rates & park availability/);
});
test("reward ledger carries partial units across frequent manual claims", () => {
  assert.match(server, /SUM\(\$\{petParkRewardClaims\.earnedDurationMs\}\)/);
  assert.match(server, /totalDuration = Number\(history\?\.duration/);
  assert.match(server, /Math\.floor\(totalDuration \* \(settings\?\.essencePerHour/);
  const earned = (rate: number, durations: number[]) => {
    let credited = 0, elapsed = 0;
    return durations.map(ms => {
      elapsed += ms;
      const reward = (rate === 24 ? Math.floor(elapsed / 300_000) * 2 : Math.floor(elapsed * rate / 3_600_000)) - credited;
      credited += reward;
      return reward;
    });
  };
  assert.deepEqual(earned(24, [60_000,60_000,60_000,60_000,60_000]), [0,0,0,0,2]);
  assert.deepEqual(earned(60, [60_000,60_000,60_000]), [1,1,1]);
  assert.deepEqual(earned(300, [60_000,60_000]), [5,5]);
});
