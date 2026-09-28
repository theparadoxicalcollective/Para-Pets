import assert from "node:assert/strict";
import test from "node:test";
import { LONELLE_REQUIRED_KILLS, nextLonelleDefeat, parseLonelleProgress } from "../server/lonelleQuest";

test("five accepted Clearing kills find the scarf exactly once", () => {
  let progress = parseLonelleProgress('{"status":"accepted","kills":0,"scarfInventoryId":null}');
  for (let i = 1; i <= LONELLE_REQUIRED_KILLS; i++) {
    progress = nextLonelleDefeat(progress);
    assert.equal(progress?.kills, i);
    assert.equal(progress?.status, i === 5 ? "found" : "accepted");
  }
  assert.equal(nextLonelleDefeat(progress), null);
  assert.equal(nextLonelleDefeat({ status: "taken", kills: 5, scarfInventoryId: "scarf" }), null);
  assert.equal(nextLonelleDefeat({ status: "claimed", kills: 5, scarfInventoryId: "scarf" }), null);
});

test("invalid saved quest state cannot advance", () => {
  assert.equal(parseLonelleProgress("not-json"), null);
  assert.equal(parseLonelleProgress('{"status":"unknown","kills":4}'), null);
  assert.equal(nextLonelleDefeat(parseLonelleProgress("not-json")), null);
});
