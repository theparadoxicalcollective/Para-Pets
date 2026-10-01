import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resolveWorldLocationInteraction,
  worldLocationRequiresHatchedPet,
} from "../client/src/worlds/locationInteraction";

const location = (
  overrides: Partial<{ id: string; type: string; isShop: boolean }> = {},
) => ({
  id: "location-1",
  type: "landmark",
  isShop: false,
  ...overrides,
});

test("world-specific destinations take precedence over generic location types", () => {
  assert.deepEqual(
    resolveWorldLocationInteraction(
      location({ type: "fishing" }),
      false,
      { kind: "route", route: "/games/example" },
    ),
    { kind: "route", route: "/games/example" },
  );

  assert.deepEqual(
    resolveWorldLocationInteraction(
      location({ isShop: true }),
      false,
      { kind: "notice", title: "Coming soon!", description: "Not ready yet." },
    ),
    { kind: "notice", title: "Coming soon!", description: "Not ready yet." },
  );

  assert.deepEqual(
    resolveWorldLocationInteraction(
      location({ type: "fishing" }),
      false,
      { kind: "scenic" },
    ),
    { kind: "scenic" },
  );
});

test("shared location resolver preserves fishing before shop only when the location is not a shop", () => {
  assert.deepEqual(
    resolveWorldLocationInteraction(location({ type: "fishing", isShop: false }), false),
    { kind: "fishing" },
  );

  assert.deepEqual(
    resolveWorldLocationInteraction(location({ type: "fishing", isShop: true }), false),
    { kind: "shop" },
  );
});

test("shared location resolver preserves shop behavior", () => {
  assert.deepEqual(
    resolveWorldLocationInteraction(location({ type: "landmark", isShop: true }), false),
    { kind: "shop" },
  );
});

test("battle and explore locations warn normal players but remain scenic for admins", () => {
  for (const type of ["battle", "explore"]) {
    assert.deepEqual(
      resolveWorldLocationInteraction(location({ type }), false),
      { kind: "danger-warning" },
      type,
    );
    assert.deepEqual(
      resolveWorldLocationInteraction(location({ type }), true),
      { kind: "scenic" },
      type,
    );
  }
});

test("ordinary locations keep the scenic fallback", () => {
  assert.deepEqual(
    resolveWorldLocationInteraction(location({ type: "landmark" }), false),
    { kind: "scenic" },
  );
});

test("hatched-pet requirement matches the existing battle/explore player gate", () => {
  assert.equal(worldLocationRequiresHatchedPet(location({ type: "battle" })), true);
  assert.equal(worldLocationRequiresHatchedPet(location({ type: "explore" })), true);
  assert.equal(worldLocationRequiresHatchedPet(location({ type: "fishing" })), false);
  assert.equal(worldLocationRequiresHatchedPet(location({ type: "landmark" })), false);
  assert.equal(
    worldLocationRequiresHatchedPet(location({ type: "battle", isShop: true })),
    false,
  );
});

test("WorldPage applies resolver actions but no longer owns the location decision tree", () => {
  const source = readFileSync("client/src/pages/WorldPage.tsx", "utf8");
  const openStart = source.indexOf("const openLocation = useCallback");
  const clickStart = source.indexOf("const handleLocationClick = useCallback", openStart);
  const clickEnd = source.indexOf("// LOAD saved team", clickStart);
  assert.ok(openStart >= 0 && clickStart > openStart && clickEnd > clickStart);

  const interactionSection = source.slice(openStart, clickEnd);

  assert.match(
    source,
    /import \{ resolveWorldLocationInteraction, worldLocationRequiresHatchedPet \} from "@\/worlds\/locationInteraction"/,
  );
  assert.match(
    interactionSection,
    /const interaction = resolveWorldLocationInteraction\([\s\S]*?resolveClientWorldDestination\(worldId, loc\.id\)/,
  );
  assert.match(interactionSection, /switch \(interaction\.kind\)/);
  assert.match(
    interactionSection,
    /worldLocationRequiresHatchedPet\(loc\) && \(!currentUser\.activePetId \|\| !hasHatchedActivePet\)/,
  );

  assert.doesNotMatch(interactionSection, /loc\.type === "fishing" && !loc\.isShop/);
  assert.doesNotMatch(
    interactionSection,
    /\(loc\.type === "battle" \|\| loc\.type === "explore"\) && !currentUser\.isAdmin/,
  );
  assert.doesNotMatch(interactionSection, /e2f3a4b5-0003-4000-8000-000000000003/);
});

test("Haunted Woods Soul Pond scenic behavior is world-owned", () => {
  const destinations = readFileSync(
    "client/src/worlds/haunted-woods/destinations.ts",
    "utf8",
  );
  const registry = readFileSync("client/src/worlds/registry.ts", "utf8");

  assert.match(destinations, /LEGACY_SOUL_POND_LOCATION_ID/);
  assert.match(destinations, /kind: "scenic"/);
  assert.match(
    registry,
    /\[WORLD_IDS\.hauntedWoods\]: \{[\s\S]*?resolveDestination: getHauntedWoodsLocationDestination/,
  );
});
