import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const closet = readFileSync("client/src/components/PetEquipAccessoriesPage.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");

test("Closet viewport owns wide-device scenery while authored template keeps coordinates", () => {
  assert.match(closet, /<ViewportScenePortal interactive=\{false\}>[\s\S]*data-testid="closet-viewport-environment"/);
  assert.match(closet, /data-testid="closet-authored-template"[\s\S]*data-stage-coordinate-space="canonical"[\s\S]*data-viewport-visual-owner="scene"/);
  assert.match(closet, /data-canonical-visual-layer="duplicate-backdrop"/);
  assert.match(shell, /#game-stage\[data-coordinate-owner="stage"\] \[data-viewport-visual-owner="scene"\]/);
  assert.match(shell, /#game-stage\[data-coordinate-owner="stage"\] \[data-canonical-visual-layer="duplicate-backdrop"\]/);
});

test("Closet protected authored geometry and tutorial targets remain unchanged", () => {
  assert.match(closet, /data-testid="closet-pet-preview"[\s\S]*left: "19%"[\s\S]*top: "21\.2%"[\s\S]*width: "56%"[\s\S]*height: "39\.5%"/);
  assert.match(closet, /data-testid="button-open-mini-pets"[\s\S]*left: "7\.5%"[\s\S]*top: "43\.5%"[\s\S]*width: "15\.5%"/);
  assert.match(closet, /data-testid=\{`slot-accessory-\$\{slot\}`\}/);
  assert.match(closet, /data-testid="button-close-equip-accessories"/);
});

test("Closet equipment and mini-pet data paths remain present", () => {
  assert.match(closet, /`\/api\/pet\/\$\{petInventoryId\}\/accessories`/);
  assert.match(closet, /queryKey: \["\/api\/mini-pets\/inventory"\]/);
  assert.match(closet, /`\/api\/pet\/\$\{petInventoryId\}\/mini-pet`/);
  assert.match(closet, /queryKey: \["\/api\/inventory"\]/);
});
