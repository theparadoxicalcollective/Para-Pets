import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("Veridian Watcher and Support remain visible when Pet Menu is expanded", () => {
  const start = home.indexOf("Veridian Watcher + Support — device-edge upper-right HUD");
  const end = home.indexOf("World Chat Panel — render on the same device HUD", start);
  assert.ok(start >= 0 && end > start);
  const section = home.slice(start, end);
  assert.match(section, /!showProfile && !activePetModal && !showWorldChat && !showSupportModal/);
  assert.doesNotMatch(section, /!showActionMenu/);
  assert.match(section, /data-testid="button-open-world-chat"/);
  assert.match(section, /data-testid="button-open-support"/);
  assert.match(section, /<ViewportHudPortal>/);
});
