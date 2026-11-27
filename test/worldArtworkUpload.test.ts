import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  validWorldArtwork, worldArtworkError, worldArtworkRequestFits, WORLD_ARTWORK_MAX_BASE64,
  WORLD_ARTWORK_MAX_REQUEST_DATA, WORLD_SCENE_MAX_ASSETS,
} from "../shared/worlds/worldSceneContent";
import { referencedWorldAssetFilter, worldAssetCapacityAvailable } from "../server/worldSceneAssetUsage";
import type { db } from "../server/db";
import { readFileSync } from "node:fs";

test("high-quality uploads use the existing image processor's ceiling, not the old six MB rejection", () => {
  const data = "data:image/png;base64," + "A".repeat(8_000_000);
  assert.equal(validWorldArtwork(data), true);
  assert.equal(validWorldArtwork("data:image/png;base64," + "A".repeat(WORLD_ARTWORK_MAX_BASE64)), true);
  assert.equal(worldArtworkError("data:image/png;base64," + "A".repeat(WORLD_ARTWORK_MAX_BASE64 + 4)), "size");
  assert.equal(worldArtworkError("data:image/svg+xml;base64,YWJj"), "format");
  assert.equal(worldArtworkError("data:image/png;base64,===="), "format");
  assert.equal(worldArtworkError("data:image/png;base64,abc"), "format");
  assert.equal(validWorldArtwork("data:image/webp;base64,YWJj"), true);
  assert.equal(validWorldArtwork("data:image/gif;base64,YWJj"), true);
});

test("combined artwork stays below the request limit, including optional room images", () => {
  const image = "A".repeat(WORLD_ARTWORK_MAX_REQUEST_DATA / 3);
  assert.equal(worldArtworkRequestFits([image, image, image, null]), true);
  assert.equal(worldArtworkRequestFits([image, image, image, "A"]), false);
});

test("active artwork query counts only same-world outdoor and interior references", () => {
  const query = new PgDialect().sqlToQuery(referencedWorldAssetFilter("swamp"));
  assert.match(query.sql, /"world_scene_assets"\."world_id" = \$1/);
  assert.match(query.sql, /EXISTS \(SELECT 1 FROM "world_scene_placements"/);
  assert.match(query.sql, /"world_scene_placements"\."asset_id" = "world_scene_assets"\."id"/);
  assert.match(query.sql, /EXISTS \(SELECT 1 FROM "world_scene_interior_items"/);
  assert.match(query.sql, /"world_scene_interior_items"\."asset_id" = "world_scene_assets"\."id"/);
  assert.deepEqual(query.params, ["swamp", "swamp", "swamp"]);
});

test("full worlds still permit another placement of a referenced artwork", async () => {
  const mock = (total: number, alreadyUsed: boolean) => ({
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        where: () => "id" in fields
          ? { limit: async () => alreadyUsed ? [{ id: "existing" }] : [] }
          : Promise.resolve([{ total }]),
      }),
    }),
  }) as unknown as typeof db;
  assert.equal(await worldAssetCapacityAvailable(mock(WORLD_SCENE_MAX_ASSETS, true), "swamp", "existing"), true);
  assert.equal(await worldAssetCapacityAvailable(mock(WORLD_SCENE_MAX_ASSETS, false), "swamp", "unused"), false);
  assert.equal(await worldAssetCapacityAvailable(mock(WORLD_SCENE_MAX_ASSETS - 1, false), "swamp"), true);
  assert.equal(await worldAssetCapacityAvailable(mock(WORLD_SCENE_MAX_ASSETS, false), "swamp"), false);
});

test("all three scene consumers use the same referenced artwork selection without deleting media", () => {
  const content = readFileSync("server/routes/worldSceneContent.routes.ts", "utf8");
  const publication = readFileSync("server/routes/worldScenePublication.routes.ts", "utf8");
  assert.match(content, /from\(worldSceneAssets\)\.where\(referencedWorldAssetFilter\(worldId\)\)/);
  assert.equal(publication.match(/from\(worldSceneAssets\)\.where\(referencedWorldAssetFilter\(worldId\)\)/g)?.length, 2);
  assert.equal(content.match(/worldAssetCapacityAvailable\(db, worldId, asset.id\)/g)?.length, 2);
  assert.doesNotMatch(readFileSync("server/worldSceneAssetUsage.ts", "utf8"), /\.delete\(|DELETE FROM/);
});
