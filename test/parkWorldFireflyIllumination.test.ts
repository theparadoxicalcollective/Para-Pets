import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getParkFireflyStrength } from "../client/src/lib/homeOutdoorLighting";
import { parkOutdoorFireflyFields, parkOutdoorLightRadius } from "../shared/petParkAtmosphere";
import { parkSceneFireflyMaskChannel, parkSceneLampMaskChannel, PARK_SCENE_LAMP_MAX_REVEAL } from "../client/src/lib/parkSceneLighting";

const source = (path: string) => readFileSync(path, "utf8");

test("fireflies wake after the existing lamp dusk transition and sleep at dawn", () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 8, h, m);
  assert.equal(getParkFireflyStrength("auto", at(18)), 0);
  assert.equal(getParkFireflyStrength("auto", at(19, 29)), 0);
  assert.equal(getParkFireflyStrength("auto", at(19, 30)), 0);
  assert.ok(getParkFireflyStrength("auto", at(19, 45)) > 0);
  assert.equal(getParkFireflyStrength("auto", at(20, 15)), 1);
  assert.equal(getParkFireflyStrength("auto", at(1)), 1);
  assert.equal(getParkFireflyStrength("auto", at(6)), 0);
  assert.equal(getParkFireflyStrength("day", at(23)), 0);
  assert.equal(getParkFireflyStrength("night", at(14)), 1);
});

test("each individual firefly cuts a small neutral pool out of the existing night mask", () => {
  const src = source("client/src/components/HomeOutdoorAtmosphere.tsx");
  const art = source("client/src/components/ParkFireflySwarm.tsx");
  assert.match(src, /activeFireflies\.length > 0[\s\S]*renderFireflies\("mask"\)/);
  assert.match(src, /activeFireflies\.length > 0[\s\S]*renderFireflies\("visible"\)/);
  assert.match(src, /ParkFireflyParticles mode=\{mode\}/);
  assert.match(src, /parkSceneFireflyMaskChannel\(fireflyStrength, falloff\)/);
  assert.match(art, /data-testid="park-firefly-light-cutout"/);
  assert.match(art, /<animateTransform[\s\S]*repeatCount="indefinite"/);
  assert.ok(parkSceneFireflyMaskChannel(1, 1) < 255);
  assert.equal(parkSceneFireflyMaskChannel(1, 0), 255);
  assert.equal(parkSceneFireflyMaskChannel(0, 1), 255);
  assert.ok(parkSceneFireflyMaskChannel(1, 1) > 100, "glow is a small subtle scenery reveal, not daylight");
});

test("park and world use one shared scene transform and cap offscreen swarms", () => {
  const scene = { width: 1000, height: 1000, scale: 1 };
  const camera = { x: 0, y: 0 };
  const viewport = { width: 1000, height: 1000 };
  const fields = parkOutdoorFireflyFields([
    { id: "swarm", kind: "effect", effectType: "fireflies",
      xPct: .5, yPct: .5, size: 190, flipped: false },
    { id: "decor", kind: "decor", xPct: .2, yPct: .3, size: 200, flipped: false,
      decorEffects: [{ id: "glow", type: "fireflies", x: .5, y: .5, size: 60 }] },
  ], scene, camera, viewport);
  assert.equal(fields.length, 2);
  assert.deepEqual(fields[0], { id: "swarm", x: .5, y: .5, size: 19 });
  assert.equal(fields[1].id, "decor-glow");
  assert.match(source("client/src/pages/PetParkPage.tsx"), /fireflies=\{parkFireflies\}/);
  assert.match(source("client/src/pages/WorldSceneEditorPage.tsx"), /fireflies=\{exteriorFireflies\}/);
});

test("lamp size controls its light radius; fire and home lighting remain separate", () => {
  const smaller = parkOutdoorLightRadius({id:"a",type:"lamp_light",x:.5,y:.5,size:2},1000,true);
  const larger = parkOutdoorLightRadius({id:"b",type:"lamp_light",x:.5,y:.5,size:8},1000,true);
  assert.ok(smaller < larger);
  assert.ok(smaller < 100 && larger <= 320,
    "larger scene lamps reach farther but never exceed the 32% scene-height cap");
  assert.equal(PARK_SCENE_LAMP_MAX_REVEAL, 0.66);
  assert.ok(parkSceneLampMaskChannel(1, 1) > 60);
  assert.match(source("client/src/components/ParkEffectVisual.tsx"), /type === "colored_light"/,
    "previously saved colored-light objects still render");
  assert.match(source("server/routes/worldSceneContent.routes.ts"), /effectType !== "lamp_light"/,
    "new lamp types accept custom colors");
});
