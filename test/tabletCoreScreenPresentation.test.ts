import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const pvp = readFileSync("client/src/pages/PvpArenaPage.tsx", "utf8");
const map = readFileSync("client/src/pages/MapPage.tsx", "utf8");

test("Active Pet action wheel and controls own the full-device HUD", () => {
  const start = home.indexOf("Active pet action menu (mystical ring)");
  const end = home.indexOf("Quest guide arrow — Phase 1", start);
  const section = home.slice(start, end);
  assert.match(section, /<ViewportHudPortal>[\s\S]*data-testid="active-pet-action-viewport-backdrop"/);
  assert.match(section, /data-testid="active-pet-action-canonical-ring"/);
  assert.match(section, /<ViewportHudPortal>[\s\S]*data-testid="active-pet-action-canonical-ring"/);
  assert.match(section, /style=\{\{ zIndex: 50, pointerEvents: "none" \}\}/);
  assert.match(section, /pointerEvents: "none"/);
  assert.match(section, /width: "min\(calc\(92\*var\(--vw\)\), 520px\)"/);
  for (const selector of ["button-action-power-up", "button-action-pet-stats", "button-action-level-up", "button-action-equip-accessories", "button-action-care-feed"]) {
    assert.equal(section.includes(selector), true, selector);
  }
});

test("PvP owns a full-device forest backdrop without moving its lobby controls", () => {
  assert.match(pvp, /import ViewportBackdropPortal from "@\/components\/ViewportBackdropPortal"/);
  assert.match(pvp, /data-testid="pvp-arena-page"/);
  assert.match(pvp, /<ViewportBackdropPortal>[\s\S]*data-testid="pvp-arena-viewport-backdrop"/);
  assert.match(pvp, /backgroundImage: `url\(\$\{forestBgImg\}\)`/);
  assert.match(pvp, /data-testid="button-close-pvp"/);
  assert.match(pvp, /data-testid="button-open-ticket-shop"/);
  assert.match(pvp, /data-testid="text-pvp-arena-title"/);
});

test("World Map owns tablet surroundings but keeps the authored map canvas and placement math", () => {
  assert.match(map, /<ViewportScenePortal>/);
  assert.match(map, /data-testid="world-map-viewport-camera"/);
  assert.match(map, /backgroundImage:.*mapBgData/);
  assert.doesNotMatch(map, /ViewportBackdropPortal/);
  assert.doesNotMatch(map, /world-map-viewport-backdrop/);
  assert.match(map, /ref=\{mapRef\}/);
  assert.match(map, /dragScenePercentage\(/);
  assert.match(map, /setRaidDragPos\(dragScenePercentage\(/);
  assert.match(map, /positionMutation\.mutate\(\{ worldId: d\.worldId, posX: Math\.round\(dragPos\.x\), posY: Math\.round\(dragPos\.y\) \}\)/);
  assert.match(map, /raidIconPosMutation\.mutate\(\{ posX: Math\.round\(pos\.x\), posY: Math\.round\(pos\.y\) \}\)/);
});
