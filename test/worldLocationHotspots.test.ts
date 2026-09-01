import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const WORLD_LOCATIONS_PATH = "client/src/components/world/WorldLocations.tsx";

test("world locations render named admin hotspots instead of map building art", () => {
  const source = fs.readFileSync(WORLD_LOCATIONS_PATH, "utf8");

  assert.match(source, /admin-location-hotspot-\$\{loc\.id\}/);
  assert.match(source, /\{loc\.name\}/);
  assert.match(source, /Make \$\{loc\.name\} hotspot smaller/);
  assert.match(source, /Make \$\{loc\.name\} hotspot larger/);
  assert.match(source, /onResizeLocation\(loc\.id, next\)/);

  // Keep iconUrl on the data shape so production records and legacy art stay
  // intact, but do not render or preload the saved icon/building image.
  assert.match(source, /iconUrl: string \| null/);
  assert.doesNotMatch(source, /thumbUrl\(/);
  assert.doesNotMatch(source, /src=\{[^}]*loc\.iconUrl/);
});

test("players see a clear animated gold sparkle cluster but keep the existing location click behavior", () => {
  const source = fs.readFileSync(WORLD_LOCATIONS_PATH, "utf8");

  assert.match(source, /player-location-hotspot-\$\{loc\.id\}/);
  assert.match(source, /location-sparkle-\$\{loc\.id\}/);
  assert.match(source, /worldHotspotSparklePulse/);
  assert.match(source, /worldHotspotSparkleCore/);
  assert.match(source, /location-sparkle-particle-/);
  assert.match(source, /linear-gradient\(135deg, #fffce8/);
  assert.match(source, /translate\(-50%, -50%\) scale/);
  assert.doesNotMatch(source, /radial-gradient\(circle, rgba\(255,247,196/);
  assert.match(source, /activateLocation\(loc\)/);
  assert.match(source, /onLocationClick\(loc\)/);
});

test("Haunted Casino special destination remains wired through the invisible world hotspot", () => {
  const source = fs.readFileSync(WORLD_LOCATIONS_PATH, "utf8");

  assert.match(source, /isScrollableHauntedCasino\(loc, worldId\)/);
  assert.match(source, /setCasinoScene\(loc\)/);
  assert.match(source, /data-testid="haunted-casino-scroll-view"/);
  assert.match(source, /overflow-x-auto overflow-y-hidden/);
  assert.match(source, /WebkitOverflowScrolling: "touch"/);
});
