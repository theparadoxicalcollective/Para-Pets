import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { claimablePetParkRewards, PET_PARK_BASE_REWARD_RATES } from "../shared/petParkAccrual";
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
  assert.deepEqual(PET_PARK_BASE_REWARD_RATES, { coinsPerHour: 60, essencePerHour: 24, petXpPerHour: 300 });
  assert.match(editor, /setRates\(\{ \.\.\.PET_PARK_BASE_REWARD_RATES \}\)/);
  assert.match(editor, /Save reward rates\s*</);
});
test("reward ledger carries partial units across frequent manual claims", () => {
  assert.match(server, /SUM\(\$\{petParkRewardClaims\.earnedDurationMs\}\)/);
  assert.match(server, /claimablePetParkRewards\(duration, Number\(history\?\.duration/);
  const earned = (rate: number, durations: number[]) => {
    let credited = 0, elapsed = 0;
    return durations.map(ms => {
      const reward = claimablePetParkRewards(ms, elapsed, { coins: 0, essence: credited, petXp: 0 },
        { coinsPerHour: 0, essencePerHour: rate, petXpPerHour: 0 }).essence;
      elapsed += ms;
      credited += reward;
      return reward;
    });
  };
  assert.deepEqual(earned(24, [60_000,60_000,60_000,60_000,60_000]), [0,0,0,0,2]);
  assert.deepEqual(earned(60, [60_000,60_000,60_000]), [1,1,1]);
  assert.deepEqual(earned(300, [60_000,60_000]), [5,5]);
});

test("park access switches save directly without submitting unsaved reward inputs", () => {
  assert.match(editor, /role="switch" aria-checked=\{option\.checked\}/);
  assert.match(editor, /method: "PATCH", url: "\/api\/admin\/pet-park\/availability", body: \{ \[option\.field\]: !option\.checked \}/);
  assert.match(editor, /Pet Park access saved/);
  assert.match(editor, /method: "PUT", url: "\/api\/admin\/pet-park\/reward-rates", body: rates/);
  assert.match(editor, /queryKey: \["\/api\/admin\/pet-park\/settings"\], enabled: mode === "settings"/);
  assert.doesNotMatch(editor, /Unsaved access changes|\/api\/admin\/pet-park\/publishing|Save reward rates & park availability/);
  assert.match(page, /queryKey: \["\/api\/pet-park\/scene"\], staleTime: 0, refetchOnMount: "always"/);
  assert.match(page, /refetchOnWindowFocus: true, refetchInterval: 30_000/);
});

test("saved Pet Park dirt and brush preview share a darker brown color", () => {
  const terrain = readFileSync("client/src/components/PetParkTerrain.tsx", "utf8");
  const detail = readFileSync("client/src/components/PetParkTerrainDetail.tsx", "utf8");
  assert.match(terrain, /kind === "dirt_path" \? "#624832"/);
  assert.match(detail, /backgroundColor: "#624832"/);
});
