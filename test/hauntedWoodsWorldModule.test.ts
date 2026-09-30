import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Haunted Woods shared definitions live under the world namespace with legacy compatibility", () => {
  const owner = read("shared/worlds/hauntedWoods.ts");
  const compat = read("shared/hauntedWoods.ts");

  assert.match(owner, /HAUNTED_WOODS_WORLD_ID = WORLD_IDS\.hauntedWoods/);
  assert.match(owner, /SOUL_EXCHANGE_LOCATION/);
  assert.match(owner, /HAUNTED_WOODS_FISHING_SPOTS/);
  assert.equal(compat.trim(), 'export * from "./worlds/hauntedWoods";');
});

test("Haunted Woods reconciliation lives under its world module with legacy compatibility", () => {
  const owner = read("server/worlds/haunted-woods/reconcile.ts");
  const compat = read("server/worlds/hauntedWoods.ts");

  assert.match(owner, /from "@shared\/worlds\/hauntedWoods"/);
  assert.match(owner, /export async function reconcileHauntedWoodsWorld/);
  assert.match(owner, /HAUNTED_WOODS_FISHING_SPOTS/);
  assert.match(owner, /HAUNTED_CASINO_LOCATION_ID/);
  assert.match(owner, /SOUL_EXCHANGE_LOCATION/);
  assert.equal(
    compat.trim(),
    'export { reconcileHauntedWoodsWorld } from "./haunted-woods/reconcile";',
  );
});

test("startup uses the new Haunted Woods world owner directly", () => {
  const source = read("server/startup/runStartup.ts");
  assert.match(
    source,
    /import \{ reconcileHauntedWoodsWorld \} from "\.\.\/worlds\/haunted-woods\/reconcile"/,
  );
  assert.match(source, /await reconcileHauntedWoodsWorld\(\)/);
  assert.doesNotMatch(
    source,
    /import \{ reconcileHauntedWoodsWorld \} from "\.\.\/worlds\/hauntedWoods"/,
  );
});

test("Haunted Woods client presentation is owned by its world module", () => {
  const presentation = read("client/src/worlds/haunted-woods/presentation.ts");
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(presentation, /shop_haunted_woods\.png/);
  assert.match(presentation, /worldId: WORLD_IDS\.hauntedWoods/);
  assert.match(presentation, /accent: "#8b008b"/);
  assert.match(
    presentation,
    /linear-gradient\(180deg, rgba\(30,5,30,0\.7\) 0%, rgba\(60,10,60,0\.3\) 50%, rgba\(15,3,15,0\.7\) 100%\)/,
  );

  assert.match(
    worldPage,
    /import \{ HAUNTED_WOODS_PRESENTATION \} from "@\/worlds\/haunted-woods\/presentation"/,
  );
  assert.match(
    worldPage,
    /\[WORLD_IDS\.hauntedWoods\]: HAUNTED_WOODS_PRESENTATION/,
  );
  assert.doesNotMatch(worldPage, /import shopHauntedWoods/);
});

test("Haunted Woods feature systems remain independent feature modules", () => {
  const reconcile = read("server/worlds/haunted-woods/reconcile.ts");
  const presentation = read("client/src/worlds/haunted-woods/presentation.ts");

  for (const feature of [
    "beauPrizeWheel",
    "hauntedBingo",
    "hauntedCasino",
    "hauntedSlotPrizes",
  ]) {
    assert.doesNotMatch(reconcile, new RegExp(`from .*\\b${feature}\\b`));
  }

  for (const overlay of [
    "BeauPrizeWheelOverlay",
    "HauntedBingoOverlay",
    "HauntedCasinoRuntime",
    "SlaughterSlotsOverlay",
  ]) {
    assert.doesNotMatch(presentation, new RegExp(overlay));
  }
});

test("Haunted Woods world migration does not alter shared world access or authored layout", () => {
  const registry = read("shared/worlds/worldRegistry.ts");
  assert.match(
    registry,
    /\[WORLD_IDS\.hauntedWoods\]: \{[\s\S]*?access: "staff",[\s\S]*?fixedMapHeight: 1440,/,
  );
});
