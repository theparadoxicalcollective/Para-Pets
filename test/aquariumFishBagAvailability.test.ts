import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("aquarium fish bag allows all remaining unplaced copies of a fish type", () => {
  const source = readFileSync("client/src/pages/AquariumPage.tsx", "utf8");
  assert.ok(source.includes("if (cf.inAquarium) continue;"));
  assert.ok(source.includes("const canAdd = aquariumFish.length < AQ_MAX && count > 0;"));
  assert.ok(!source.includes("inTank < count"));
});

test("aquarium fish bag preserves source inventory and mutation refresh", () => {
  const source = readFileSync("client/src/pages/AquariumPage.tsx", "utf8");
  assert.ok(source.includes('queryKey: ["/api/fishing/inventory"]'));
  assert.ok(source.includes('queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] })'));
});
