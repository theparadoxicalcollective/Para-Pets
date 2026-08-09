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

  const background = fs.readFileSync(assetPath(SOUL_EXCHANGE_LOCATION.backgroundAssetPath));
  assert.deepEqual([...background.subarray(0, 3)], [0xff, 0xd8, 0xff], "background should retain its original JPEG encoding");
  assert.ok(fs.existsSync(assetPath(SOUL_EXCHANGE_LOCATION.iconAssetPath)));
  assert.equal(fs.existsSync("attached_assets/uploads/SoulExchangeBackground.png"), false);
});

test("Soul Exchange portal is a lightweight purple mobile asset with reduced-motion support", () => {
  const portal = fs.readFileSync(assetPath(SOUL_EXCHANGE_LOCATION.iconAssetPath), "utf8");
  assert.match(portal, /viewBox="0 0 420 520"/);
  assert.match(portal, /#8b5cf6/i);
  assert.match(portal, /prefers-reduced-motion:reduce/);
  assert.match(portal, /portal-breathe/);
  assert.match(portal, /soul-mote/);
  assert.doesNotMatch(portal, /stroke-dasharray/i);
  assert.doesNotMatch(portal, /<ellipse[^>]+portal-shimmer/i);
  assert.doesNotMatch(portal, /<script/i);
  assert.doesNotMatch(portal, /(?:href|xlink:href)="https?:/i);
});

test("Haunted Woods reconciliation refreshes presentation without overwriting admin layout", () => {
  const source = fs.readFileSync("server/worlds/hauntedWoods.ts", "utf8");
  assert.match(source, /ON CONFLICT \(id\) DO UPDATE SET/);
  assert.match(source, /LEGACY_SOUL_POND_LOCATION_ID/);
  assert.match(source, /lower\(name\) IN \('phantom hollow', 'soul pond'\)/);
  assert.match(source, /versionedWorldAssetUrl/);

  const conflictUpdate = source.slice(source.indexOf("ON CONFLICT (id) DO UPDATE SET"), source.indexOf("`;", source.indexOf("ON CONFLICT (id) DO UPDATE SET")));
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
  assert.match(source, /snapshot = snapshot\.filter\(entry => entry\.id !== duplicate\.id\)/);
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

test("focused Haunted Woods reconciliation runs after legacy startup backfills", () => {
  const source = fs.readFileSync("server/startup/runStartup.ts", "utf8");
  const legacyIndex = source.indexOf("await runNonCriticalStartup()");
  const focusedIndex = source.indexOf("await reconcileHauntedWoodsWorld()");
  assert.ok(legacyIndex >= 0);
  assert.ok(focusedIndex > legacyIndex);
  assert.match(source, /withStartupAdvisoryLock\(pool, runBackgroundInitialization\)/);
});
