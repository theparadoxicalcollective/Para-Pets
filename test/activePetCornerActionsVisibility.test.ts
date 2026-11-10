import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("Watcher dock remains available when legacy Pet Menu opens; Support lives in main navigation", () => {
  const start = home.indexOf("The Watcher lives beneath the five-pet party panel");
  const end = home.indexOf("World Chat Panel — render on the same device HUD", start);
  assert.ok(start >= 0 && end > start);
  const section = home.slice(start, end);
  assert.match(section, /!showProfile && !activePetModal && !showWorldChat && !showSupportModal/);
  assert.doesNotMatch(section, /!showActionMenu/);
  assert.match(section, /data-testid="viewport-hud-watcher-dock"/);
  assert.match(section, /data-testid="button-open-world-chat"/);
  assert.match(section, /<ViewportHudPortal>/);
  assert.doesNotMatch(section, /data-testid="button-open-support"/);
  assert.match(nav, /data-testid="nav-item-support"/);
  assert.match(nav, /para-pets:open-support/);
});
