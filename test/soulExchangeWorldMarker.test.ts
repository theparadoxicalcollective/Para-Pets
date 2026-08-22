import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shared = fs.readFileSync("shared/hauntedWoods.ts", "utf8");
const reconcile = fs.readFileSync("server/worlds/hauntedWoods.ts", "utf8");
const portal = fs.readFileSync("attached_assets/worlds/haunted_woods/soul-exchange-portal-v4.svg", "utf8");
const cardPolish = fs.readFileSync("client/src/soulExchangeCardPolish.css", "utf8");
const main = fs.readFileSync("client/src/main.tsx", "utf8");

test("Haunted Woods restores the admin-saved Soul Exchange position during reconciliation", () => {
  assert.match(reconcile, /admin_pos_locs__haunted_woods/);
  assert.match(reconcile, /if \(canonicalSnapshot\)/);
  assert.match(reconcile, /SET pos_x = \$\{canonicalSnapshot\.posX\}, pos_y = \$\{canonicalSnapshot\.posY\}/);
});

test("Haunted Woods uses the transparent smoky Soul Exchange portal", () => {
  assert.match(shared, /soul-exchange-portal-v4\.svg/);
  assert.match(portal, /class="se-vortex"/);
  assert.match(portal, /class="se-vortex-rev"/);
  assert.match(portal, /class="se-wisp/);
  assert.match(portal, /class="se-spark/);
  assert.match(portal, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(portal, /<rect[^>]+fill="(?:#|rgb)/i);
});

test("Soul Exchange card polish hides the redundant lower selector and moves identity lower", () => {
  assert.match(main, /soulExchangeCardPolish\.css/);
  assert.match(cardPolish, /\[data-soul-card="available"\] > button:last-of-type[\s\S]*display: none !important/);
  assert.match(cardPolish, /\[data-soul-card\] > \[data-soul-availability\][\s\S]*height: 70% !important/);
  assert.match(cardPolish, /\[data-soul-card\] > \[data-soul-availability\] > div[\s\S]*margin-top: 7% !important/);
});
