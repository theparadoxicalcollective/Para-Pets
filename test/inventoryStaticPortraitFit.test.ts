import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync("client/src/components/PetAnimatorCore.tsx", "utf8");
const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");

test("static visible-fit portraits measure their real slot and still analyze transparent pixels", () => {
  const measurement = core.slice(core.indexOf("// Static fitVisible portraits"), core.indexOf("// Flying pets keep"));
  assert.match(measurement, /if \(!fillContainer \|\| \(performanceStatic && !fitVisible\)\) return/);
  assert.match(measurement, /Math\.min\(el\.clientWidth, el\.clientHeight\)/);
  assert.match(measurement, /new ResizeObserver/);
  assert.match(measurement, /if \(\(performanceStatic && !fitVisible\) \|\| lowMemory \|\| !allParts\.length\) return/);
  assert.match(measurement, /getAlphaBounds\(p\.imageUrl\)/);
});

test("inventory portraits stay static, preserve equipped appearance and use the owned evolution state", () => {
  const portrait = inventory.slice(inventory.indexOf("function InventoryPetPortrait"), inventory.indexOf("function getRarityStyle"));
  assert.match(portrait, /petInventoryId=\{petInventoryId\}/);
  assert.match(portrait, /artworkForm=\{isEvolved === undefined \? undefined : isEvolved \? "evolution" : "base"\}/);
  assert.match(portrait, /mode="static"[\s\S]*fillContainer fitVisible performanceStatic/);
  assert.match(portrait, /overflow: "hidden"/);
  assert.match(portrait, /<MiniPetRenderer petInventoryId=\{petInventoryId\} animated=\{false\}/);
  assert.match(portrait, /<VisibleAssetImage src=\{imageUrl\}/);
  assert.match(inventory, /portrait \? <VisibleAssetImage src=\{portrait\}/);
});
