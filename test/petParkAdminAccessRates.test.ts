import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const editor = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const server = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");

test("closed Pet Park does not block admins, but keeps normal players behind under construction", () => {
  assert.match(page, /!scene\?\.canEnterPark && !scene\?\.canEditPark/);
  assert.match(page, /Admin preview · Park closed to players/);
  assert.match(page, /scene\?\.canEditPark && showCreator/);
  assert.match(page, /scene\?\.canEditPark && detailsBuilding/);
  assert.match(page, /\["effects", "\+ Effects"\]/);
  assert.match(page, /initialMode=\{editorMode\} mode="create"/);
  assert.doesNotMatch(page, /Advanced edit/);
});
test("admin settings and direct creation retain water effects, player access and explicit reward preset", () => {
  assert.match(editor, /mode: "create" \| "settings"/);
  assert.match(editor, /HOME_OUTDOOR_EFFECT_OPTIONS\.map\(option/);
  assert.match(editor, /WATER_EFFECT_OPTIONS\.map\(option/);
  assert.match(editor, /option.type === "sleep" \? "Rest Spot \(Sleep Square\)"/);
  assert.doesNotMatch(editor, /value: "sleep_spot", label: "Rest Spot"/);
  assert.match(page, /onPointerMove=\{movePlacement\}/);
  assert.match(editor, /Allow players into Pet Park/);
  assert.match(editor, /Allow moderators into Pet Park/);
  assert.match(editor, /mode === "settings"/);
  assert.match(page, /\["scene", "\+ Building"\]/);
  assert.match(page, /\["decor", "\+ Decor"\]/);
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

test("park access controls are real switches with explicit on/off state and save feedback", () => {
  assert.match(editor, /role="switch" aria-checked=\{option\.checked\}/);
  assert.match(editor, /option\.setChecked\(!option\.checked\)/);
  assert.match(editor, /Unsaved access changes/);
  assert.match(editor, /Pet Park settings saved/);
  assert.match(editor, /enabledForPlayers: publish \?\? data!\.settings\.enabledForPlayers/);
  assert.match(editor, /enabledForModerators: moderatorPreview \?\? data!\.settings\.enabledForModerators/);
});

test("saved Pet Park dirt and brush preview share a darker brown color", () => {
  const terrain = readFileSync("client/src/components/PetParkTerrain.tsx", "utf8");
  const detail = readFileSync("client/src/components/PetParkTerrainDetail.tsx", "utf8");
  assert.match(terrain, /ctx\.fillStyle = "#624832"/);
  assert.match(detail, /backgroundColor: "#624832"/);
});
