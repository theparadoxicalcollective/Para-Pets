import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const battle = readFileSync("client/src/pages/PvpBattlePage.tsx", "utf8");

test("PvP battle overlay portals to viewport instead of legacy root stage", () => {
  assert.match(battle, /createPortal\(/);
  assert.match(battle, /data-testid="pvp-battle-stage-overlay"/);
  assert.match(battle, /className="fixed inset-0 flex flex-col"/);
  assert.match(battle, /touchAction: "none"/);
  assert.match(battle, /document\.body,\s*\);/);
  assert.doesNotMatch(battle, /getStagePortalTarget|clientToStagePortal|getStageScale/);
});

test("PvP battle result actions and overlay remain present", () => {
  assert.match(battle, /data-testid="text-pvp-victory"/);
  assert.match(battle, /data-testid="text-pvp-defeat"/);
  assert.match(battle, /data-testid="button-pvp-result-close"/);
});
