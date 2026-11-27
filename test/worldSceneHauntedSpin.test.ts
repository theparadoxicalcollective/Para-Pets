import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveWorldSceneAction, HAUNTED_SPIN_DECOR_NAME } from "../shared/worlds/worldSceneActions";
import { HAUNTED_SPIN_DECOR_ART } from "../shared/beauPrizeWheel";
import { auditWorldActivation } from "../shared/worlds/worldScenePublication";

const asset = { id: "spin-art", worldId: "haunted_woods", kind: "decor", name: HAUNTED_SPIN_DECOR_NAME, imageUrl: "art" };
const placement = { id: "spin", kind: "decor", assetId: asset.id, npcId: null, legacyLocationId: null, isShop: false };
const beau = { id: "old-beau", worldId: "haunted_woods", type: "npc", name: "Beau", isShop: false };

test("only the named Haunted Woods decoration is connected to the original prize wheel", () => {
  assert.equal(resolveWorldSceneAction("haunted_woods", "decor", asset), "beau-prize-wheel");
  assert.equal(resolveWorldSceneAction("haunted_woods", "decor", { ...asset, name: "  HAUNTED SPIN  " }), "beau-prize-wheel");
  const renamedArtwork = { ...asset, name: "Spin entrance", imageUrl: HAUNTED_SPIN_DECOR_ART };
  assert.equal(resolveWorldSceneAction("haunted_woods", "decor", renamedArtwork), "beau-prize-wheel");
  assert.equal(resolveWorldSceneAction("swamp", "decor", { ...renamedArtwork, worldId: "swamp" }), null);
  assert.equal(resolveWorldSceneAction("haunted_woods", "building", { ...renamedArtwork, kind: "building" }), null);
  for (const wrong of [{ ...asset, worldId: "swamp" }, { ...asset, kind: "building" },
    { ...asset, name: "Haunted Spinning Wheel" }, { ...asset, name: "Haunted Casino" }, null, undefined]) {
    assert.equal(resolveWorldSceneAction("haunted_woods", "decor", wrong), null);
  }
  assert.equal(resolveWorldSceneAction("swamp", "decor", asset), null);
  for (const kind of ["building", "npc", "terrain", "effect"])
    assert.equal(resolveWorldSceneAction("haunted_woods", kind, asset), null);
});

test("valid placed Haunted Spin covers only the uniquely identified original Beau entrance", () => {
  const input = { hasGround: true, placements: [placement], assets: [asset], npcs: [], locations: [beau] };
  assert.deepEqual(auditWorldActivation("haunted_woods", input), []);
  // Old Beau is optional, and the migration doesn't rely on his data surviving.
  assert.deepEqual(auditWorldActivation("haunted_woods", { ...input, locations: [] }), []);
  assert.ok(auditWorldActivation("haunted_woods", { ...input, placements: [] }).includes("Connect original NPC: Beau"));
  assert.ok(auditWorldActivation("haunted_woods", { ...input, assets: [{ ...asset, imageUrl: "" }] }).includes("Connect original NPC: Beau"));
  assert.ok(auditWorldActivation("haunted_woods", { ...input, assets: [{ ...asset, name: "Ordinary Wheel" }] }).includes("Connect original NPC: Beau"));
  const casino = { id: "casino", worldId: "haunted_woods", type: "scenic", name: "Haunted Casino", isShop: false };
  assert.deepEqual(auditWorldActivation("haunted_woods", { ...input, locations: [beau, casino] }),
    ["Connect original location: Haunted Casino"]);
  assert.ok(auditWorldActivation("haunted_woods", { ...input, locations: [beau, { ...beau, id: "another" }] }).includes("Connect original NPC: Beau"),
    "ambiguous original NPC names must not bypass the activation guard");
  assert.deepEqual(auditWorldActivation("haunted_woods", {
    ...input, placements: [placement, { ...placement, id: "linked-copy" }],
  }), [], "linked copies share the same wheel, not a second reward system");
});

test("both entry points share the existing wheel dialog and authenticated state endpoint", () => {
  const player = readFileSync("client/src/pages/WorldScenePlayerPage.tsx", "utf8");
  const bridge = readFileSync("client/src/components/BeauPrizeWheelBridge.tsx", "utf8");
  const dialog = readFileSync("client/src/components/world/BeauPrizeWheelDialog.tsx", "utf8");
  const launcher = readFileSync("client/src/components/world/useWorldSceneBeauWheel.ts", "utf8");
  assert.match(player, /if \(moved\.current\)[\s\S]*sceneActions\.get\(item\.id\)/);
  assert.match(player, /<BeauPrizeWheelDialog/);
  assert.match(bridge, /<BeauPrizeWheelDialog/);
  assert.match(dialog, /fetch\("\/api\/beau-prize-wheel"/);
  assert.match(dialog, /credentials: "include", cache: "no-store"/);
  assert.match(launcher, /await readBeauPrizeWheelState\(controller\.signal\)/);
  assert.match(launcher, /if \(!next\.ready && !next\.isAdmin\)/);
  assert.doesNotMatch(launcher, /world\/.*locations|legacyLocationId|\/spin"|method: "POST"/);
  assert.match(bridge, /data-has-haunted-spin="true"/);
});
