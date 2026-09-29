import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const bridge = readFileSync("client/src/components/NpcQuestAwareDialogueBridge.tsx", "utf8");
const main = readFileSync("client/src/main.tsx", "utf8");

test("mounts the quest-aware dialogue bridge", () => {
  assert.match(main, /import NpcQuestAwareDialogueBridge from "\.\/components\/NpcQuestAwareDialogueBridge"/);
  assert.match(main, /<NpcQuestAwareDialogueBridge \/>/);
});

test("restores Ginny and Lonelle dialogue only after their one-time quests are claimed", () => {
  assert.match(bridge, /const GINNY_QUEST_KEY = "ginny_mini_pet_companion"/);
  assert.match(bridge, /const LONELLE_QUEST_KEY = "lonelle_lost_adornment"/);
  assert.match(bridge, /ginnyStatus === "claimed"/);
  assert.match(bridge, /lonelleStatus === "claimed"/);
  assert.match(bridge, /if \(!ginnyFinished && !lonelleFinished\) return \[\];/);
});

test("loads the live player quest state instead of treating registry association as availability", () => {
  assert.match(bridge, /fetch\("\/api\/quests\/ginny-mini-pet"/);
  assert.match(bridge, /getNpcQuestAssociations\(location\.name, location\.worldId\)/);
});

test("restores click dialogue for both player and admin interaction paths", () => {
  assert.match(bridge, /button-quest-finished-talk-npc-/);
  assert.match(bridge, /admin-location-hotspot-/);
  assert.match(bridge, /chooseNpcMessage\(messages/);
});

test("fails closed while either quest state is unknown", () => {
  assert.match(bridge, /if \(!ginnyFinished && !lonelleFinished\) return \[\];/);
  assert.match(bridge, /setGinnyStatus\(null\)/);
  assert.match(bridge, /setLonelleStatus\(null\)/);
});
