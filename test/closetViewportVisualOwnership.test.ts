import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const closet = readFileSync("client/src/components/PetEquipAccessoriesPage.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");

test("Closet viewport owns wide-device scenery while authored template keeps coordinates", () => {
  assert.match(closet, /<ViewportScenePortal interactive=\{false\}>[\s\S]*data-testid="closet-viewport-environment"/);
  assert.match(closet, /data-testid="closet-authored-template"[\s\S]*data-stage-coordinate-space="canonical"[\s\S]*data-viewport-visual-owner="scene"/);
  assert.doesNotMatch(closet, /data-canonical-visual-layer="duplicate-backdrop"/);
  assert.match(closet, /@assets\/uploads\/NewActivePetBG\.png/);
  assert.match(closet, /background: "transparent"/);
  assert.match(shell, /#game-stage\[data-coordinate-owner="stage"\] \[data-viewport-visual-owner="scene"\]/);
  assert.match(shell, /#game-stage\[data-coordinate-owner="stage"\] \[data-canonical-visual-layer="duplicate-backdrop"\]/);
});

test("Closet oval stage and protected tutorial targets remain on the canonical template", () => {
  assert.match(closet, /data-testid="closet-pet-preview"[\s\S]*left: "5%"[\s\S]*top: "28%"[\s\S]*width: "90%"[\s\S]*aspectRatio: "1"/);
  assert.match(closet, /data-testid="button-open-mini-pets"[\s\S]*left: "7\.5%"[\s\S]*top: "55%"[\s\S]*width: "13%"/);
  assert.match(closet, /data-testid=\{`slot-accessory-\$\{slot\}`\}/);
  assert.match(closet, /data-testid="button-close-equip-accessories"/);
});

test("Closet equipment and mini-pet data paths remain present", () => {
  assert.match(closet, /`\/api\/pet\/\$\{petInventoryId\}\/accessories`/);
  assert.match(closet, /queryKey: \["\/api\/mini-pets\/inventory"\]/);
  assert.match(closet, /`\/api\/pet\/\$\{petInventoryId\}\/mini-pet`/);
  assert.match(closet, /queryKey: \["\/api\/inventory"\]/);
});
