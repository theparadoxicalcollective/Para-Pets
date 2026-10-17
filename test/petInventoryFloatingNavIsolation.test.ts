import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const policy = readFileSync("client/src/lib/playerPagePresentation.ts", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("Pet Inventory owns its full-screen input without floating navigation", () => {
  const hidden = policy.slice(policy.indexOf("const NAV_HIDDEN_EXACT"), policy.indexOf("const NAV_HIDDEN_PREFIXES"));
  assert.match(hidden, /"\/pets"/);
  assert.match(app, /!shouldHideFloatingNav\(location\) && !petStatsOpen && !navOverlayOpen/);
  assert.match(app, /location === "\/pets"/);
  assert.match(app, /<PetInventoryPage \/>/);
  assert.match(nav, /navigate\("\/pets"\)/);
});

test("Pet Inventory remains stage-owned and does not hide home navigation", () => {
  const isolated = policy.slice(policy.indexOf("const ISOLATED_EXACT"), policy.indexOf("const ISOLATED_PREFIXES"));
  assert.doesNotMatch(isolated, /"\/pets"/);
  const hidden = policy.slice(policy.indexOf("const NAV_HIDDEN_EXACT"), policy.indexOf("const NAV_HIDDEN_PREFIXES"));
  assert.doesNotMatch(hidden, /"\/"/);
});
