import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseNpcMessage,
  getNpcQuestAssociations,
  parseNpcMetadata,
  serializeNpcMetadata,
} from "../client/src/lib/npcMetadata";

test("NPC metadata round-trips animation and at most three trimmed messages", () => {
  const encoded = serializeNpcMetadata({
    animation: "float",
    messages: [" Hello ", "Second", "Third", "Fourth"],
  });
  assert.deepEqual(parseNpcMetadata(encoded), {
    animation: "float",
    messages: ["Hello", "Second", "Third"],
  });
});

test("legacy world NPC descriptions safely fall back to no animation or dialogue", () => {
  assert.deepEqual(parseNpcMetadata("World NPC"), { animation: "none", messages: [] });
  assert.deepEqual(parseNpcMetadata(null), { animation: "none", messages: [] });
});

test("random NPC dialogue avoids immediately repeating a line when alternatives exist", () => {
  assert.equal(chooseNpcMessage(["One", "Two", "Three"], "One", () => 0), "Two");
  assert.equal(chooseNpcMessage(["Only"], "Only", () => 0.5), "Only");
});

test("Ginny quest association is recognized only in its quest world when a world is supplied", () => {
  const adminView = getNpcQuestAssociations("Ginny");
  assert.equal(adminView.length, 1);
  assert.equal(adminView[0]?.key, "ginny_mini_pet_companion");

  assert.equal(getNpcQuestAssociations("Ginny", "haunted_woods").length, 1);
  assert.equal(getNpcQuestAssociations("Ginny", "elysian_bayou").length, 0);
  assert.equal(getNpcQuestAssociations("Different NPC", "haunted_woods").length, 0);
});
