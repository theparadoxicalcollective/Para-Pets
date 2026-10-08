import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const pvp = readFileSync("client/src/pages/PvpArenaPage.tsx", "utf8");
const map = readFileSync("client/src/pages/MapPage.tsx", "utf8");

test("Active Pet independent Pet Menu owns full-device HUD", () => {
  const start = home.indexOf("Screen-relative Pet Menu");
  const end = home.indexOf("Quest guide arrow — Phase 1", start);
  const section = home.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(section, /<ViewportHudPortal>/);
  assert.match(section, /data-testid="active-pet-side-menu"/);
  assert.match(section, /data-testid="button-open-pet-menu"/);
  assert.match(section, /left-2/);
  for (const selector of ["button-action-power-up", "button-action-level-up", "button-action-equip-accessories", "button-action-care-feed"]) {
    assert.equal(section.includes(selector), true, selector);
  }
  assert.equal(section.includes("button-action-pet-stats"), false);
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
