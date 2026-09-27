import assert from "node:assert/strict";
import test from "node:test";
import { ADORNMENT_SLOT_MAP } from "../shared/costumeFeature";
import { normalizeCostumePlacements } from "../shared/costumeFeature";
import { costumePlacementSchema } from "../shared/costumeSchema";
import { semanticFollowPartType } from "../client/src/lib/costumeFollowPart";
import { readFileSync } from "node:fs";

test("Head fittings target the selected animated head with or without an item effect", () => {
  for (const effect of [null, "follow_part", "float", "sway", "pulse"]) {
    assert.equal(semanticFollowPartType(ADORNMENT_SLOT_MAP.head, effect, {}), "head");
    assert.equal(semanticFollowPartType(ADORNMENT_SLOT_MAP.head, effect, { followPartIndex: 2 }), "h2_head");
    assert.equal(semanticFollowPartType(ADORNMENT_SLOT_MAP.head, effect, { followPartIndex: 3 }), "h3_head");
  }
});

test("other slots only use semantic targets for Follow Part", () => {
  assert.equal(semanticFollowPartType(ADORNMENT_SLOT_MAP.left_hand, "follow_part", {}), "left_hand");
  assert.equal(semanticFollowPartType(ADORNMENT_SLOT_MAP.right_hand, "follow_part", {}), "right_hand");
  assert.equal(semanticFollowPartType(ADORNMENT_SLOT_MAP.back, "follow_part", {}), "body");
  assert.equal(semanticFollowPartType(ADORNMENT_SLOT_MAP.wings, "follow_part", {}), null);
  assert.equal(semanticFollowPartType(ADORNMENT_SLOT_MAP.left_hand, "float", {}), null);
  assert.equal(semanticFollowPartType(ADORNMENT_SLOT_MAP.back, null, {}), null);
  assert.equal(semanticFollowPartType(ADORNMENT_SLOT_MAP.left_hand, "float", { animation: "follow_part" }), "left_hand");
  assert.equal(semanticFollowPartType(ADORNMENT_SLOT_MAP.back, null, { animation: "follow_part" }), "body");
});

test("an admin-saved Follow Part fitting survives validation and normalization for either pet form", () => {
  for (const form of ["base", "evolution"] as const) {
    for (const anchorPart of ["independent", "head"]) {
      const placement = costumePlacementSchema.parse({
        form, view: "front", depth: "front", anchorPart, animation: "follow_part",
        followPartIndex: 2, posX: 500, posY: 500, width: 100, height: 100,
        pivotX: 50, pivotY: 50,
      });
      const [normalized] = normalizeCostumePlacements([placement]);
      assert.equal(normalized.animation, "follow_part");
      assert.equal(normalized.form, form);
      assert.equal(normalized.followPartIndex, 2);
    }
  }
  const editor = readFileSync("client/src/components/PetDatabasePanel.tsx", "utf8");
  const itemForm = readFileSync("client/src/components/ItemDatabaseSection.tsx", "utf8");
  assert.match(editor, /<option value="follow_part">Follow Part — move with pet layer<\/option>/);
  assert.match(editor, /value=\{selectedCostumePlacement\.animation \?\? "none"\}/);
  assert.match(itemForm, /ADORNMENT_ITEM_EFFECTS\.filter\(effect => effect !== "follow_part"\)/);
});
