import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateStageLayout,
  calculateViewportHudRect,
  calculateViewportSurfaceRect,
} from "../client/src/lib/stage";

const read = (path: string) => readFileSync(path, "utf8");

const devices = [
  { name: "small Android portrait", width: 360, height: 740 },
  { name: "iPhone 12 reference", width: 390, height: 844 },
  { name: "large phone portrait", width: 430, height: 932 },
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "large tablet portrait", width: 1024, height: 1366 },
  { name: "tablet landscape", width: 1194, height: 834 },
  { name: "desktop landscape", width: 1440, height: 900 },
] as const;

test("critical device matrix maps backdrop and HUD to every physical viewport edge", () => {
  for (const device of devices) {
    const layout = calculateStageLayout(device.width, device.height, 0, 0, {
      fitPortraitReference: device.height > device.width,
    });
    assert.equal(layout.designWidth, 390, device.name);
    assert.equal(layout.designHeight, 844, device.name);
    for (const [surfaceName, surface] of [
      ["backdrop", calculateViewportSurfaceRect(layout)],
      ["HUD", calculateViewportHudRect(layout)],
    ] as const) {
      const left = layout.left + surface.left * layout.scale;
      const top = layout.top + surface.top * layout.scale;
      const right = layout.left + (surface.left + surface.width) * layout.scale;
      const bottom = layout.top + (surface.top + surface.height) * layout.scale;
      assert.ok(Math.abs(left) < 0.001, `${device.name} ${surfaceName} left`);
      assert.ok(Math.abs(top) < 0.001, `${device.name} ${surfaceName} top`);
      assert.ok(Math.abs(right - device.width) < 0.001, `${device.name} ${surfaceName} right`);
      assert.ok(Math.abs(bottom - device.height) < 0.001, `${device.name} ${surfaceName} bottom`);
    }
  }
});

test("iPhone 12 keeps its exact authored layout and 1:1 scale", () => {
  const layout = calculateStageLayout(390, 844);
  assert.equal(layout.scale, 1);
  assert.equal(layout.left, 0);
  assert.equal(layout.top, 0);
});

test("Active Pet keeps pet menu on HUD and does not restore legacy background", () => {
  const home = read("client/src/pages/HomePage.tsx");
  assert.match(home, /data-testid="active-pet-viewport-backdrop"/);
  assert.match(home, /@assets\/uploads\/NewActivePetBG\.png/);
  assert.match(home, /<ViewportHudPortal>[\s\S]*data-testid="button-open-pet-menu"/);
  assert.doesNotMatch(home, /@assets\/uploads\/ActivePetBG\.png/);
});

test("Closet and Level Up share new background without a duplicate canonical image", () => {
  const closet = read("client/src/components/PetEquipAccessoriesPage.tsx");
  const level = read("client/src/components/PetLevelUpPage.tsx");
  assert.match(closet, /NewActivePetBG\.png/);
  assert.match(level, /NewActivePetBG\.png/);
  assert.doesNotMatch(closet, /data-canonical-visual-layer="duplicate-backdrop"/);
  assert.match(closet, /data-testid="button-close-equip-accessories"/);
  assert.match(level, /data-testid="zone-levelup-pet-drop"/);
  assert.match(level, /ref=\{zoneRef\}/);
});

test("world map icons and map art remain in the same movable scene", () => {
  const map = read("client/src/pages/MapPage.tsx");
  assert.match(map, /<ViewportScenePortal>/);
  assert.match(map, /data-testid="world-map-viewport-camera"/);
  assert.match(map, /backgroundImage:.*mapBgData/);
  assert.match(map, /left: `\$\{pos\.x\}%`/);
  assert.match(map, /top: `\$\{pos\.y\}%`/);
  assert.match(map, /data-quest-guide-pan-surface/);
});
