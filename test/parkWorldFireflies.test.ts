import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getParkFireflyStrength, HOME_OUTDOOR_DUSK_START_MINUTE, PARK_FIREFLY_START_MINUTE } from "../client/src/lib/homeOutdoorLighting";
import { parkOutdoorEffectOpacity } from "../client/src/lib/parkSceneLighting";
import { isParkEffect } from "../shared/petParkEffects";
import { isValidParkDecorEffects } from "../shared/petParkDecorEffects";
import { validEffect } from "../shared/worlds/worldSceneContent";

const date = (hours: number, minutes = 0) => new Date(2026, 10, 8, hours, minutes);
const read = (path: string) => readFileSync(path, "utf8");

test("Fireflies appear at 19:30 and finish fading out by 06:00", () => {
  assert.equal(HOME_OUTDOOR_DUSK_START_MINUTE, 18 * 60);
  assert.equal(PARK_FIREFLY_START_MINUTE, 19 * 60 + 30);
  assert.equal(getParkFireflyStrength("auto", date(18)), 0);
  assert.equal(getParkFireflyStrength("auto", date(19, 29)), 0);
  assert.equal(getParkFireflyStrength("auto", date(19, 30)), 0);
  assert.equal(getParkFireflyStrength("auto", date(19, 52)), 22 / 45);
  assert.equal(getParkFireflyStrength("auto", date(20, 15)), 1);
  assert.equal(getParkFireflyStrength("auto", date(23)), 1);
  assert.equal(getParkFireflyStrength("auto", date(3)), 1);
  assert.equal(getParkFireflyStrength("auto", date(5, 45)), .5);
  assert.equal(getParkFireflyStrength("auto", date(6)), 0);
  assert.equal(getParkFireflyStrength("day", date(22)), 0);
  assert.equal(getParkFireflyStrength("night", date(12)), 1);
  assert.equal(parkOutdoorEffectOpacity("fireflies", 1, 0), 0);
  assert.equal(parkOutdoorEffectOpacity("fireflies", 1, .5), .5);
  assert.equal(parkOutdoorEffectOpacity("fireflies", 0, 1), 1);
  assert.equal(parkOutdoorEffectOpacity("fire", 0, 0), 1, "campfire unchanged");
  assert.equal(parkOutdoorEffectOpacity("lamp_light", 1, 0), 1, "lamp clock unchanged");
});

test("Pet Park and World Editor accept standalone and attached fireflies", () => {
  assert.equal(isParkEffect("fireflies"), true);
  assert.equal(validEffect("fireflies"), true);
  assert.equal(isValidParkDecorEffects([{ id: "swarm", type: "fireflies", x: .5, y: .4, size: 68 }]), true);
  for (const file of [
    "client/src/components/PetParkAdminPanel.tsx",
    "client/src/components/world-editor/WorldSceneControls.tsx",
    "client/src/components/PetParkDecorEffectEditor.tsx",
    "client/src/components/world-editor/WorldDecorEffectEditor.tsx",
  ]) assert.match(read(file), /fireflies/, file + " offers an effect selection");
  for (const file of [
    "client/src/pages/PetParkPage.tsx",
    "client/src/pages/WorldSceneEditorPage.tsx",
    "client/src/components/PetParkDecorEffects.tsx",
    "client/src/components/world-editor/WorldDecorEffects.tsx",
  ]) assert.match(read(file), /fireflyStrength/, file + " uses the nighttime clock");
});

test("Each firefly has its own moving illuminated area in the single outdoor mask", () => {
  const visual = read("client/src/components/ParkEffectVisual.tsx");
  const particles = read("client/src/components/ParkFireflySwarm.tsx");
  const scene = read("client/src/components/HomeOutdoorAtmosphere.tsx");
  assert.match(visual, /ParkFireflyPreview/);
  assert.match(particles, /PARK_FIREFLY_PARTICLES/);
  assert.match(particles, /park-firefly-light-cutout/);
  assert.match(particles, /<animateTransform/);
  assert.match(particles, /mode === "mask"/);
  assert.match(scene, /renderFireflies\("mask"\)/);
  assert.match(scene, /renderFireflies\("visible"\)/);
  assert.match(scene, /parkSceneFireflyMaskChannel\(fireflyStrength, falloff\)/);
});
