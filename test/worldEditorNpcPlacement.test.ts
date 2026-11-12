import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (p: string) => readFileSync(p, "utf8");

test("NPC picker reuses saved art and uses the same selection and alpha-tested drag", () => {
  const editor = read("client/src/pages/WorldSceneEditorPage.tsx");
  const controls = read("client/src/components/world-editor/WorldSceneControls.tsx");
  const hits = read("client/src/lib/petParkAdminSelection.ts");
  assert.ok(controls.includes(">+ NPC</button>"));
  assert.ok(controls.includes("button-place-world-npc-"));
  assert.ok(controls.includes('kind: "npc", npcId: npc.id'));
  assert.ok(controls.includes("props.onSelect(result.id)"));
  assert.ok(editor.includes("npcById.get(p.npcId)"));
  assert.ok(hits.includes('object.kind === "npc"'));
});
test("NPC references are validated and database migration supports existing worlds", () => {
  const model = read("shared/worlds/worldSceneContent.ts");
  const schema = read("shared/schema.ts");
  const server = read("server/routes/worldSceneContent.routes.ts");
  const migration = read("server/startup/migrations/ensureWorldSceneContentStorage.ts");
  assert.ok(model.includes('WorldAssetKind | "effect" | "terrain" | "npc"'));
  assert.ok(schema.includes('npcId: varchar("npc_id").references(() => shopItems.id, { onDelete: "cascade" })'));
  assert.ok(server.includes('eq(shopItems.worldId, "__npc_catalog__")'));
  assert.ok(server.includes('kind === "npc" && !(await validCatalogNpc(db, npcId))'));
  assert.ok(migration.includes("ADD COLUMN IF NOT EXISTS npc_id varchar"));
  assert.ok(migration.includes("REFERENCES shop_items(id) ON DELETE CASCADE"));
  assert.ok(migration.includes("END $$;"));
  assert.ok(!migration.includes("END $;"));
});
