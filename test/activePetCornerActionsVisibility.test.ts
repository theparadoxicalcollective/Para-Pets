import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("Watcher stays in the Home header when legacy Pet Menu opens; Support lives in navigation", () => {
  const start = home.indexOf("const homeWatcherControl =");
  const end = home.indexOf('data-testid="active-pet-page"', start);
  assert.ok(start >= 0 && end > start);
  const section = home.slice(start, end);
  assert.match(section, /!showProfile && !activePetModal && !showWorldChat && !showSupportModal/);
  assert.doesNotMatch(section, /!showActionMenu/);
  assert.match(section, /data-testid="viewport-hud-watcher-dock"/);
  assert.match(section, /data-testid="button-open-world-chat"/);
  assert.match(home, /homeWatcher=\{homeWatcherControl\}/);
  assert.doesNotMatch(section, /data-testid="button-open-support"/);
  assert.match(nav, /"badges", "support"/);
  assert.match(nav, /testId=\{`nav-item-\$\{id\}`\}/);
  assert.match(nav, /isSupport \? handleRight\("support"\)/);
  assert.match(nav, /para-pets:open-support/);
});
