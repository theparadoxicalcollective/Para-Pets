import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  gardenActionForPlot, gardenCropProgress,
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
  assert.match(page, /garden\?\.plots\.find\(plot => plot\.plotItemId === item\.id\)/);
  assert.match(page, /data-testid="pet-park-garden-crop"/);
  assert.match(page, /parkDepthIndex\(\{ yPct: plot\.yPct/);
  assert.match(page, /onChanged=\{invalidateGarden\}/);
  assert.match(menu, /crypto\.randomUUID\(\)/);
  assert.match(menu, /retry\?\.action === action && retry\.inventoryId === inventoryId/);
  assert.match(menu, /mutation\.mutate\(retry\)/);
  assert.match(menu, /item\.isListed \|\| \(item\.quantity \?\? 0\) <= 0/);
  assert.match(menu, /item\.type === "garden_seed"/);
  assert.match(menu, /item\.type === "garden_tool"/);
  assert.match(menu, /ViewportModalPortal/);
  assert.match(menu, /border-2 border-\[#c9a65e\]/);
  assert.doesNotMatch(page, /DESIGN_W|DESIGN_H|390\s*[*×x]\s*844/);
});

test("untilled and tilled plot designs share path brown with independent four-sided borders", () => {
  const terrain = source("client/src/components/PetParkTerrainDetail.tsx");
  assert.match(terrain, /backgroundColor: tilled \? "#36261d" : "#624832"/);
  assert.match(terrain, /M120 3 L237 60 L120 117 L3 60 Z/);
  assert.match(terrain, /data-testid=\{tilled \? "pet-park-tilled-soil" : "pet-park-untilled-soil"\}/);
  assert.match(terrain, /So[f]?t diagonal furrows/);
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
