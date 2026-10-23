import assert from "node:assert/strict";
import test from "node:test";
import { arrangeParkVisitors, isParkPetNearViewport } from "../client/src/lib/petParkPopulation";

const visitors = Array.from({ length: 90 }, (_, i) => ({ petInventoryId: `visitor-${i}` }));
const buildings = [
  { kind: "decor" as const, xPct: 0.50, yPct: 0.52, size: 280 },
  { kind: "sleep_spot" as const, xPct: 0.20, yPct: 0.75, size: 120 },
];

test("visitors have deterministic nonoverlapping positions away from buildings", () => {
  const first = arrangeParkVisitors(visitors, buildings);
  const again = arrangeParkVisitors([...visitors].reverse(), buildings);
  assert.deepEqual([...first], [...again]);
  const seen = new Set();
  for (const position of first.values()) {
    const key = `${position.x}:${position.y}`;
    assert.ok(!seen.has(key), `overlapping visitors at ${key}`);
    seen.add(key);
    assert.ok(position.x >= 0.09 && position.x <= 0.91);
    assert.ok(position.y >= 0.25 && position.y <= 0.89);
    assert.ok(Math.abs(position.x - 0.5) >= 280 / 1100 / 2 + 0.045 ||
      Math.abs(position.y - 0.52) >= 280 / 1700 / 2 + 0.025);
  }
});

test("adding another visitor does not reshuffle most existing visitors", () => {
  const before = arrangeParkVisitors(visitors, buildings);
  const after = arrangeParkVisitors([...visitors, { petInventoryId: "another-visitor" }], buildings);
  let retained = 0;
  for (const [id, position] of before) {
    if (JSON.stringify(position) === JSON.stringify(after.get(id))) retained++;
  }
  assert.ok(retained >= 80, `only ${retained} of 90 visitors kept their position`);
});

test("visibility culling preserves the full roster but skips offscreen pet renderers", () => {
  const point = { x: 0.5, y: 0.5 };
  assert.equal(isParkPetNearViewport(point, 1000, 1600, -300, -500, 390, 844), true);
  assert.equal(isParkPetNearViewport(point, 1000, 1600, 0, 0, 390, 400), false);
  assert.equal(isParkPetNearViewport(point, 1000, 1600, 0, 0, 390, 400, 1000), true);
  assert.equal(arrangeParkVisitors(visitors, buildings).size, visitors.length);
});
