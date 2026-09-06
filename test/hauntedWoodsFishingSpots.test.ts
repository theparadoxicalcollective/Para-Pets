import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  HAUNTED_WOODS_FISHING_SPOTS,
  HAUNTED_WOODS_WORLD_ID,
} from "../shared/hauntedWoods";

const hauntedWorldSource = fs.readFileSync("server/worlds/hauntedWoods.ts", "utf8");
const startupGuardSource = fs.readFileSync("server/startup/preserveDynamicWorldLocations.ts", "utf8");
const worldPageSource = fs.readFileSync("client/src/pages/WorldPage.tsx", "utf8");

test("Haunted Woods defines exactly two distinct canonical fishing spots", () => {
  assert.equal(HAUNTED_WOODS_FISHING_SPOTS.length, 2);
  assert.equal(new Set(HAUNTED_WOODS_FISHING_SPOTS.map(spot => spot.id)).size, 2);
  assert.equal(
    new Set(HAUNTED_WOODS_FISHING_SPOTS.map(spot => `${spot.defaultPosition.x},${spot.defaultPosition.y}`)).size,
    2,
  );

  for (const spot of HAUNTED_WOODS_FISHING_SPOTS) {
    assert.equal(spot.worldId, HAUNTED_WOODS_WORLD_ID);
    assert.equal(spot.type, "fishing");
    assert.equal(spot.defaultPosition.x >= 0 && spot.defaultPosition.x <= 100, true);
    assert.equal(spot.defaultPosition.y >= 0 && spot.defaultPosition.y <= 100, true);
    assert.equal(spot.defaultIconSize > 0, true);
  }
});

test("Haunted Woods reconciliation creates fishing spots without overwriting admin layout", () => {
  assert.match(hauntedWorldSource, /for \(const fishingSpot of HAUNTED_WOODS_FISHING_SPOTS\)/);
  assert.match(hauntedWorldSource, /ON CONFLICT \(id\) DO UPDATE SET[\s\S]*?world_id = EXCLUDED\.world_id[\s\S]*?is_shop = false/);

  const fishingConflictBlock = hauntedWorldSource.slice(
    hauntedWorldSource.indexOf("for (const fishingSpot of HAUNTED_WOODS_FISHING_SPOTS)"),
    hauntedWorldSource.indexOf("// If Haunted Woods already had pond stock"),
  );
  assert.doesNotMatch(fishingConflictBlock, /pos_x = EXCLUDED\.pos_x/);
  assert.doesNotMatch(fishingConflictBlock, /pos_y = EXCLUDED\.pos_y/);
  assert.doesNotMatch(fishingConflictBlock, /icon_size = EXCLUDED\.icon_size/);
});

test("Haunted Woods fishing spots reuse existing world pond stock when available", () => {
  assert.match(hauntedWorldSource, /INSERT INTO pond_fish \(location_id, shop_item_id\)/);
  assert.match(hauntedWorldSource, /source\.world_id = \$\{HAUNTED_WOODS_WORLD_ID\}/);
  assert.match(hauntedWorldSource, /lower\(COALESCE\(source\.type, ''\)\) = 'fishing'/);
  assert.match(hauntedWorldSource, /ON CONFLICT DO NOTHING/);
});

test("legacy startup guard preserves Haunted Woods fishing locations", () => {
  assert.match(startupGuardSource, /world_id = 'haunted_woods'/);
  assert.match(startupGuardSource, /lower\(COALESCE\(type, ''\)\) = 'fishing'/);
  assert.match(startupGuardSource, /jsonb_populate_record/);
});

test("generic world click handling opens FishingPage for fishing locations", () => {
  assert.match(worldPageSource, /loc\.type === "fishing" && !loc\.isShop/);
  assert.match(worldPageSource, /setFishingLocation\(loc\)/);
  assert.match(worldPageSource, /<FishingPage/);
});
