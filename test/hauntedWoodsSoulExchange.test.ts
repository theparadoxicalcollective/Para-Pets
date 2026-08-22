import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  HAUNTED_WOODS_WORLD_ID,
  SOUL_EXCHANGE_LOCATION,
} from "../shared/hauntedWoods";

const assetPath = (relativePath: string) =>
  path.join(process.cwd(), "attached_assets", relativePath);

test("Soul Exchange artwork is organized as permanent Haunted Woods assets", () => {
  assert.equal(HAUNTED_WOODS_WORLD_ID, "haunted_woods");
  assert.doesNotMatch(SOUL_EXCHANGE_LOCATION.iconAssetPath, /uploads/);
  assert.doesNotMatch(SOUL_EXCHANGE_LOCATION.backgroundAssetPath, /uploads/);
  assert.match(SOUL_EXCHANGE_LOCATION.iconAssetPath, /soul-exchange-portal-v4\.svg$/);

  const background = fs.readFileSync(assetPath(SOUL_EXCHANGE_LOCATION.backgroundAssetPath));
  assert.deepEqual([...background.subarray(0, 3)], [0xff, 0xd8, 0xff], "background should retain its original JPEG encoding");
  assert.ok(fs.existsSync(assetPath(SOUL_EXCHANGE_LOCATION.iconAssetPath)));
  assert.equal(fs.existsSync("attached_assets/uploads/SoulExchangeBackground.png"), false);
});

test("Soul Exchange world marker uses a transparent smoky violet vortex instead of the old sparkle marker", () => {
  const portal = fs.readFileSync(assetPath(SOUL_EXCHANGE_LOCATION.iconAssetPath), "utf8");
  assert.match(portal, /viewBox="0 0 600 440"/);
  assert.match(portal, /#7c3aed/i);
  assert.match(portal, /prefers-reduced-motion:reduce/);
  assert.match(portal, /class="se-vortex"/);
  assert.match(portal, /class="se-vortex-rev"/);
  assert.match(portal, /class="se-wisp/);
  assert.match(portal, /class="se-spark/);
  assert.match(portal, /filter id="blur18"/);
  assert.match(portal, /filter id="blur7"/);
  assert.doesNotMatch(portal, /<rect[^>]+fill="(?:#|rgb)/i, "portal should remain transparent rather than adding a solid background");
  assert.doesNotMatch(portal, /<script/i);
  assert.doesNotMatch(portal, /(?:href|xlink:href)="https?:/i);
});

test("Haunted Woods reconciliation refreshes presentation without overwriting admin layout", () => {
  const source = fs.readFileSync("server/worlds/hauntedWoods.ts", "utf8");
  assert.match(source, /ON CONFLICT \(id\) DO UPDATE SET/);
  assert.match(source, /LEGACY_SOUL_POND_LOCATION_ID/);
  assert.match(source, /id = \$\{LEGACY_SOUL_POND_LOCATION_ID\} AND lower\(name\) IN \('phantom hollow', 'soul pond'\)/);
  assert.match(source, /versionedWorldAssetUrl/);

  const conflictUpdate = source.match(
    /ON CONFLICT \(id\) DO UPDATE SET[\s\S]*?\n\s*`\);/,
  )?.[0];
  assert.ok(conflictUpdate, "canonical reconciliation upsert should be present");
  assert.doesNotMatch(conflictUpdate, /pos_x\s*=/);
  assert.doesNotMatch(conflictUpdate, /pos_y\s*=/);
  assert.doesNotMatch(conflictUpdate, /icon_size\s*=/);
  assert.doesNotMatch(conflictUpdate, /sort_order\s*=/);
  assert.doesNotMatch(conflictUpdate, /flipped\s*=/);
});

test("legacy Soul Exchange layout and Haunted Woods snapshot migrate before duplicate deletion", () => {
  const source = fs.readFileSync("server/worlds/hauntedWoods.ts", "utf8");
  const migrate = source.indexOf("migratedLayout");
  const snapshot = source.indexOf("admin_pos_locs__haunted_woods");
  const deletion = source.indexOf("DELETE FROM world_locations", source.indexOf("Layout and its snapshot"));
  assert.ok(snapshot >= 0 && migrate >= 0 && deletion > migrate);
  assert.match(source, /icon_size=\$\{migratedLayout\.iconSize\}/);
  assert.match(source, /sort_order=\$\{migratedLayout\.sortOrder\}/);
  assert.match(source, /flipped=\$\{migratedLayout\.flipped\}/);
  assert.match(source, /snapshot = snapshot\.filter\(entry => !duplicateIds\.has\(entry\.id\)\)/);
  assert.match(source, /duplicateWithSnapshot/);
  assert.match(source, /layoutSource = duplicateWithSnapshot \?\? duplicates\[0\]/);
});

test("Soul Exchange uses the shared scenic location flow and does not require an active pet", () => {
  assert.equal(SOUL_EXCHANGE_LOCATION.type, "landmark");
  const source = fs.readFileSync("client/src/pages/WorldPage.tsx", "utf8");
  assert.match(
    source,
    /!loc\.isShop && loc\.type !== "fishing" && \(loc\.type === "battle" \|\| loc\.type === "explore"\)/,
  );
  assert.match(
    source,
    /else \{\s*setFishingLocation\(null\);\s*setShowShop\(false\);\s*setShowLocationView\(true\);\s*\}/s,
  );
});

test("Haunted Casino scenic background can pan horizontally without changing shop or combat locations", () => {
  const source = fs.readFileSync("client/src/components/world/WorldLocations.tsx", "utf8");
  assert.match(source, /function isScrollableHauntedCasino/);
  assert.match(source, /worldId === "haunted_woods"/);
  assert.match(source, /\/casino\/i\.test\(location\.name\)/);
  assert.match(source, /!location\.isShop/);
  assert.match(source, /location\.type !== "fishing"/);
  assert.match(source, /location\.type !== "battle"/);
  assert.match(source, /location\.type !== "explore"/);
  assert.match(source, /data-testid="haunted-casino-scroll-view"/);
  assert.match(source, /overflow-x-auto overflow-y-hidden/);
  assert.match(source, /WebkitOverflowScrolling: "touch"/);
  assert.match(source, /touchAction: "pan-x"/);
  assert.match(source, /scrollLeft = Math\.max\(0, \(scroller\.scrollWidth - scroller\.clientWidth\) \/ 2\)/);
});

test("Haunted Woods reconciliation exposes the seeded casino to the Casino scroller", () => {
  const source = fs.readFileSync("server/worlds/hauntedWoods.ts", "utf8");
  assert.match(source, /HAUNTED_CASINO_LOCATION_ID = "e2f3a4b5-0001-4000-8000-000000000001"/);
  assert.match(source, /SET name = 'Haunted Casino'/);
  assert.match(source, /id = \$\{HAUNTED_CASINO_LOCATION_ID\}/);
});

test("focused Haunted Woods reconciliation runs after legacy startup backfills", () => {
  const source = fs.readFileSync("server/startup/runStartup.ts", "utf8");
  const legacyIndex = source.indexOf("await runNonCriticalStartup()");
  const focusedIndex = source.indexOf("await reconcileHauntedWoodsWorld()");
  assert.ok(legacyIndex >= 0);
  assert.ok(focusedIndex > legacyIndex);
  assert.match(source, /withStartupAdvisoryLock\(pool, runBackgroundInitialization\)/);
});
