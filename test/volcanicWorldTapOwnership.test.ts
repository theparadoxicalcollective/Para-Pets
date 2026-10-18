import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveWorldLocationInteraction } from "../client/src/worlds/locationInteraction";
import { getVolcanicLocationDestination } from "../client/src/worlds/volcanic/destinations";
import { VOLCANIC_LOCATION_IDS } from "../shared/worlds/volcanic";

const viewport = readFileSync("client/src/worlds/useWorldViewportController.ts", "utf8");
const world = readFileSync("client/src/pages/WorldPage.tsx", "utf8");

test("an unmoved map tap does not capture pointer away from destination hotspots", () => {
  const down = viewport.split("const handleVpPointerDown = useCallback")[1]?.split("const handleVpPointerMove = useCallback")[0] ?? "";
  const move = viewport.split("const handleVpPointerMove = useCallback")[1]?.split("const finishViewportPointer = useCallback")[0] ?? "";
  assert.doesNotMatch(down, /safeSetWorldPointerCapture\(/);
  assert.match(move, /Math\.abs\(dx\) > WORLD_MAP_PAN_THRESHOLD_PX/);
  assert.match(move, /Math\.abs\(dy\) > WORLD_MAP_PAN_THRESHOLD_PX/);
  assert.match(move, /mapPanningRef\.current = true;\s*safeSetWorldPointerCapture\(event\.currentTarget, event\.pointerId\)/);
  assert.match(move, /if \(mapPanningRef\.current\) \{\s*event\.preventDefault\(\);/);
});

test("volcanic Molten Blocks hint never intercepts taps intended for destinations", () => {
  const hint = world.split("{showMoltenHint && worldId === VOLCANIC_WORLD_ID")[1]?.split("{showShopHint &&")[0] ?? "";
  assert.match(hint, /Molten Blocks/);
  assert.doesNotMatch(hint, /onClick=\{\(\) => setShowMoltenHint\(false\)\}/);
  assert.match(hint, /pointer-events-none/);
  const shop = world.split("{showShopHint &&")[1]?.split("{\/\*")[0] ?? "";
  assert.doesNotMatch(shop, /onClick=\{\(\) => setShowShopHint\(null\)\}/);
});

test("volcanic location actions still resolve direct navigation and fishing", () => {
  const molten = { id: VOLCANIC_LOCATION_IDS.moltenBastion, type: "battle", isShop: false };
  assert.deepEqual(resolveWorldLocationInteraction(molten, false, getVolcanicLocationDestination(molten.id)), { kind: "route", route: "/games/molten-blocks" });
  assert.deepEqual(resolveWorldLocationInteraction({ id: "fishing-spot", type: "fishing", isShop: false }, false), { kind: "fishing" });
  assert.match(world, /handleAdminLocationClick\(loc\.id, \(\) => openLocation\(loc\)\)/);
});
