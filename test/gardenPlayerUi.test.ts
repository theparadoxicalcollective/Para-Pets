import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  gardenActionForPlot, gardenCropProgress, gardenAfterWaterPour, GARDEN_WATER_POUR_DROPS,
  type GardenPlayerCrop, type GardenPlayerPlot,
} from "../shared/garden";
const source = (path: string) => readFileSync(path, "utf8");
const crop: GardenPlayerCrop = {
  id: "crop1", seedItemId: "seed", fruitItemId: "fruit",
  seedName: "Tomato Seed", fruitName: "Tomato", ready: true,
  images: { seedPack: "/seed.png", planted: "/planted.png",
    seedling: "/sprout.png", partial: "/partial.png", grown: "/grown.png",
    picked: "/picked.png", fruit: "/tomato.png" },
  drops: { planted: 2, seedling: 5, partial: 3, grown: 1 },
  stagePlacements: {},
};
function plot(phase: GardenPlayerPlot["phase"], waterApplied = 0, harvestReady = false): GardenPlayerPlot {
  return { plotItemId: "one", xPct: .5, yPct: .5, size: 150,
    phase, waterApplied, harvestReady, cropId: phase === "empty" || phase === "tilled" ? null : crop.id,
    pickedUntil: null };
}

test("garden controls offer only the next server-legal action, not client-authorized growth", () => {
  assert.equal(gardenActionForPlot(plot("empty")), "hoe");
  assert.equal(gardenActionForPlot(plot("tilled")), "plant");
  for (const phase of ["planted", "seedling", "partial", "grown"] as const)
    assert.equal(gardenActionForPlot(plot(phase)), "water");
  assert.equal(gardenActionForPlot(plot("grown", 1, true)), "harvest");
  assert.equal(gardenActionForPlot(plot("picked")), null);
  assert.deepEqual(gardenCropProgress(plot("planted", 1), crop), { value: 1, required: 2 });
  assert.deepEqual(gardenCropProgress(plot("seedling", 2), crop), { value: 2, required: 5 });
  assert.deepEqual(gardenCropProgress(plot("partial", 3), crop), { value: 3, required: 3 });
  assert.equal(gardenCropProgress(plot("grown", 1, true), crop), null);
  assert.equal(gardenCropProgress(plot("tilled"), crop), null);
  assert.equal(gardenCropProgress(plot("empty"), crop), null);
});

test("player Garden uses current Pet Park camera, Bag and server ownership, no duplicate placement stage", () => {
  const page = source("client/src/pages/PetParkPage.tsx");
  const menu = source("client/src/components/PetParkGardenMenu.tsx");
  assert.match(page, /queryKey: \["\/api\/pet-park\/garden"\]/);
  assert.match(page, /enabled: !!scene\?\.canEnterPark && !scene\?\.canEditPark/);
  assert.match(page, /data-testid="pet-park-garden-plot"/);
  assert.match(page, /setSelectedGardenPlotId\(item\.id\)/);
  assert.match(page, /<PetParkGardenMenu/);
  assert.match(page, /garden\?\.plots\?\.find\(plot => plot\.plotItemId === item\.id\)/);
  assert.match(page, /<PetParkCropArtwork/);
  assert.match(page, /parkDepthIndex\(\{ yPct: plot\.yPct/);
  assert.match(page, /onChanged=\{invalidateGarden\}/);
  assert.match(menu, /crypto\.randomUUID\(\)/);
  assert.match(menu, /retry\?\.action === action && retry\.inventoryId === item\.inventoryId/);
  assert.match(menu, /mutation\.mutate\(retry\)/);
  assert.match(menu, /item\.isListed \|\| \(item\.quantity \?\? 0\) <= 0/);
  assert.match(menu, /item\.type === "garden_seed"/);
  assert.match(menu, /item\.type === "garden_tool"/);
  assert.match(menu, /ViewportModalPortal blocking=\{false\}/);
  assert.match(menu, /data-testid="pet-park-garden-anchor"/);
  assert.match(menu, /data-side=\{anchor\.side\}/, "tool arc can mirror near screen edge");
  assert.match(menu, /className="relative h-\[199px\]"/, "tools curve vertically beside, not across, the plot");
  assert.match(menu, /data-testid=\{"pet-park-garden-action-" \+ action\}/);
  assert.match(menu, /garden-tool-bubble/);
  assert.match(menu, /aria-disabled=\{!available\}/);
  assert.match(menu, /aria-current=\{suggested === action \? "step" : undefined\}/);
  assert.match(menu, /!motion && BUTTONS\.map/, "tools disappear for the whole animation");
  assert.match(menu, /missingMessage/);
  assert.match(menu, /Come back when you have your gardening tools/);
  assert.match(menu, /Find a Water Source to refill your pail/);
  assert.doesNotMatch(menu, /data-testid="pet-park-garden-water-gauge"|pet-park-garden-stage|pet-park-garden-progress/,
    "do not stack pail gauge, soil labels, and duplicate plant water text");
  assert.match(menu, /data-testid="pet-park-garden-animation"/);
  assert.match(menu, /onClick=\{event => \{ event.stopPropagation\(\); chooseAction\(action\); \}\}/);
  assert.match(menu, /document\.addEventListener\("pointerdown", handlePointer, true\)/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.doesNotMatch(menu, /aria-label="Close garden tools"/);
  assert.match(menu, /setMotion\(/);
  assert.match(menu, /if \(action === "plant" && items.length > 1\)/);
  assert.match(menu, /Retry safely/);
  assert.doesNotMatch(menu, /aria-modal="true"|bg-black\/75|Choose your hoe|>Use<|Next step/);
  assert.match(page, /const gardenToolAnchor = chosenGardenPlot/);
  assert.match(page, /camera.x \+ chosenGardenPlot.xPct \* sceneWidth/);
  assert.match(page, /camera.y \+ chosenGardenPlot.yPct \* sceneHeight/);
  assert.match(page, /anchor=\{gardenToolAnchor\}/);
  assert.match(page, /showWaterProgress=\{wateringGardenPlotId === plot\.plotItemId\}/);
  assert.match(page, /onWateringState=\{setWateringGardenPlotId\}/);
  assert.match(menu, /if \(action === "water"\) onWateringState\(plot\.plotItemId\)/);
  assert.match(menu, /setMotion\(null\); onWateringState\(null\)/);
  assert.match(page, /plotX \+ 158 <= viewportSize\.width \? "right" : "left"/);
  assert.match(page, /<ViewportModalPortal blocking=\{false\}>/);
  assert.match(menu, /garden-tool-bubble pointer-events-auto absolute flex h-\[48px\] w-\[48px\]/,
    "tool bubbles are smaller but keep 48px touch targets");
  assert.match(menu, /anchor\.side === "right" \? x : 125 - x - 48/,
    "compact arc still mirrors on narrow phones");
  const motionCss = source("client/src/components/PetParkGardenMenu.css");
  assert.match(motionCss, /width: 82px;\s*height: 82px;/,
    "the action artwork is scaled down above the plot");
  assert.match(motionCss, /garden-hoe-chops/);
  assert.match(motionCss, /garden-pail-tip/);
  assert.match(motionCss, /rotate\(-34deg\)/);
  assert.match(motionCss, /garden-scythe-sweep/);
  assert.match(motionCss, /garden-falling-drop/);
  assert.match(motionCss, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(page, /DESIGN_W|DESIGN_H|390\s*[*×x]\s*844/);
});

test("10-drop pours stay within a stage and only charge actual pail capacity", () => {
  assert.equal(GARDEN_WATER_POUR_DROPS, 10);
  const required = { planted: 17, seedling: 7, partial: 20, grown: 4 };
  const first = gardenAfterWaterPour({ phase: "planted", waterApplied: 0, harvestReady: false }, required, 100);
  assert.deepEqual(first, { growth: { phase: "planted", waterApplied: 10, harvestReady: false }, dropsUsed: 10 });
  const next = gardenAfterWaterPour(first.growth, required, 100);
  assert.deepEqual(next, { growth: { phase: "seedling", waterApplied: 0, harvestReady: false }, dropsUsed: 7 });
  const lowPail = gardenAfterWaterPour({ phase: "partial", waterApplied: 2, harvestReady: false }, required, 3);
  assert.equal(lowPail.dropsUsed, 3);
  assert.equal(lowPail.growth.waterApplied, 5);
  const ready = gardenAfterWaterPour({ phase: "grown", waterApplied: 0, harvestReady: false }, required, 100);
  assert.deepEqual(ready, { growth: { phase: "grown", waterApplied: 4, harvestReady: true }, dropsUsed: 4 });
  assert.throws(() => gardenAfterWaterPour(first.growth, required, 0), /empty/);
});

test("crop art centers its scanned visible pixels, not the transparent canvas, and owns stage progress", () => {
  const art = source("client/src/components/PetParkCropArtwork.tsx");
  assert.match(art, /getAlphaBounds\(image, element\)/);
  assert.match(art, /bounds\.left \+ bounds\.width \/ 2/);
  assert.match(art, /bounds\.top \+ bounds\.height/);
  assert.match(art, /data-testid="pet-park-garden-visible-art"/);
  assert.match(art, /data-testid="pet-park-garden-growth-progress"/);
  assert.match(art, /showWaterProgress && progress/);
  assert.doesNotMatch(art, /Water \{progress\.value\}|rounded-lg border border-\[#d7b879\]/,
    "progress bar must have no text or bulky container");
  assert.match(art, /role="progressbar" aria-label="Water to next growth stage"/);
  assert.match(art, /aria-valuenow=\{progress\.value\}/);
  assert.match(art, /bottom: Math\.max\(16, visibleHeight \+ 9\)/);
});

test("untilled and tilled plot designs share path brown with independent four-sided borders", () => {
  const terrain = source("client/src/components/PetParkTerrainDetail.tsx");
  assert.match(terrain, /backgroundColor: tilled \? "#36261d" : "#624832"/);
  assert.match(terrain, /M120 3 L237 60 L120 117 L3 60 Z/);
  assert.match(terrain, /data-testid=\{tilled \? "pet-park-tilled-soil" : "pet-park-untilled-soil"\}/);
  // After tilled soil is hoed, it remains dark and textured without the old
  // arched furrows that looked like accidental curved stripes on the tiles.
  const gardenStamp = terrain.split('if (type === "garden_plot")')[1]?.split('if (type === "stone_path")')[0] ?? "";
  const tilledDetail = gardenStamp.split("{tilled &&")[1]?.split("{[[36,60")[0] ?? "";
  assert.match(gardenStamp, /Smooth dark tilled earth/);
  assert.match(tilledDetail, /ellipse key=\{`grain-\$\{i\}`\}/);
  assert.doesNotMatch(tilledDetail, /<path|\bQ\d/, "no arched furrows are drawn inside tilled soil");
  assert.match(terrain, /map\(\(\[x,y,rx,ry\],i\)/);
  const brush = source("client/src/components/PetParkTerrainBrush.tsx");
  assert.match(brush, /isParkConnectedPath\(type\) \|\| type === "garden_plot" \? parkExtendPathStroke/);
  assert.match(source("shared/petParkTerrainDetails.ts"), /type: "garden_plot"/);
});

test("both public and owned visitor pets share one camera zoom transform with their interaction areas", () => {
  const page = source("client/src/pages/PetParkPage.tsx");
  const start = page.indexOf("{outdoorPets.map(pet => {");
  const end = page.indexOf("{paintMode &&", start);
  const pet = page.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(pet, /data-park-pet-world-scale/);
  assert.match(pet, /transform: `scale\(\$\{scale\}\)`/);
  assert.match(pet, /size=\{petSize\} fillContainer/);
  assert.match(pet, /<PetParkRarityStars rarity=\{pet\.rarity\} petSize=\{petSize\}/);
  assert.match(pet, /costumeAccess=\{isMine \? "owner" : "public"\}/);
  assert.doesNotMatch(pet, /size=\{petSize \* scale\} fillContainer/);
  assert.equal(pet.split("data-park-pet-world-scale").length - 1, 1,
    "one scale wrapper for art, mini pet, hit target and stars");
});
