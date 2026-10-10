import assert from "node:assert/strict";
import test from "node:test";
import {
  clientToScenePlacement,
  scenePlacementToClient,
  scenePlacementToPoint,
  scenePointToPlacement,
} from "../client/src/lib/stage";

test("scene placements are independent of the admin device viewport", () => {
  const authored = scenePointToPlacement({ x: 720, y: 1280 }, { width: 1440, height: 2560 });
  assert.deepEqual(authored, { x: 0.5, y: 0.5 });
  assert.deepEqual(scenePlacementToPoint(authored!, { width: 2880, height: 5120 }), { x: 1440, y: 2560 });

  for (const rect of [
    { left: 0, top: 0, width: 390, height: 844 },
    { left: 100, top: 40, width: 820, height: 1180 },
    { left: -240, top: -160, width: 1600, height: 2400 },
  ]) {
    const client = scenePlacementToClient(authored!, rect)!;
    assert.deepEqual(clientToScenePlacement(client.x, client.y, rect), authored);
  }
});

test("artwork coordinates allow off-screen placements for pannable worlds", () => {
  const rect = { left: -400, top: -200, width: 1200, height: 1800 };
  assert.deepEqual(clientToScenePlacement(800, 1600, rect), { x: 1, y: 1 });
  assert.deepEqual(scenePlacementToClient({ x: 1.25, y: -0.25 }, rect), { x: 1100, y: -650 });
});

test("invalid artwork extents do not generate corrupt saved placements", () => {
  assert.equal(scenePointToPlacement({ x: 1, y: 2 }, { width: 0, height: 10 }), null);
  assert.equal(scenePlacementToPoint({ x: 0.5, y: 0.5 }, { width: NaN, height: 100 }), null);
  assert.equal(clientToScenePlacement(1, 2, { left: 0, top: 0, width: 0, height: 50 }), null);
  assert.equal(scenePlacementToClient({ x: Infinity, y: 0 }, { left: 0, top: 0, width: 100, height: 100 }), null);
});
