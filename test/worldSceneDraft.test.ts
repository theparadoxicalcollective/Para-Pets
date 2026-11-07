import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultWorldSceneDraft,
  isEditableWorldSceneId,
  parseWorldSceneDraftSettings,
} from "../shared/worlds/worldSceneDraft";

test("world drafts use world-specific default ground and remain unpublished", () => {
  assert.equal(defaultWorldSceneDraft("haunted_woods").groundTheme, "haunted");
  assert.equal(defaultWorldSceneDraft("swamp").groundTheme, "swamp");
  assert.equal(defaultWorldSceneDraft("volcanic").groundTheme, "volcanic");
  assert.equal(defaultWorldSceneDraft("snowy_mountain").groundTheme, "snow");
  const draft = defaultWorldSceneDraft("sky_realm");
  assert.equal(draft.groundTheme, "grass");
  assert.equal(draft.hasSavedDraft, false);
  assert.equal(draft.updatedAt, null);
});

test("only registered world IDs can receive drafts", () => {
  assert.equal(isEditableWorldSceneId("swamp"), true);
  assert.equal(isEditableWorldSceneId("haunted_woods"), true);
  assert.equal(isEditableWorldSceneId("pet_park"), false);
  assert.equal(isEditableWorldSceneId("../pet-park"), false);
  assert.equal(isEditableWorldSceneId("unregistered_world"), false);
});

test("draft settings validate complete, typed ground configuration", () => {
  assert.deepEqual(parseWorldSceneDraftSettings({ groundLevel: 4, groundTheme: "swamp" }),
    { groundLevel: 4, groundTheme: "swamp" });
  for (const invalid of [
    null, [], {}, { groundLevel: "2", groundTheme: "grass" },
    { groundLevel: 0, groundTheme: "grass" },
    { groundLevel: 5, groundTheme: "grass" },
    { groundLevel: 1.5, groundTheme: "grass" },
    { groundLevel: 1, groundTheme: "unknown" },
  ]) {
    assert.equal(parseWorldSceneDraftSettings(invalid), null);
  }
});
