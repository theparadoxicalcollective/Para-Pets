import { arrangeParkVisitors } from "../client/src/lib/petParkPopulation";
import { isParkSleepPosition } from "../client/src/lib/petParkSleepSpots";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isMiniPetAnimation, sceneIdleAnimation, type SceneMiniPet } from "../shared/miniPet";
import { auditWorldActivation } from "../shared/worlds/worldScenePublication";
import { miniPetDefinitions, miniPetParts, petParkSceneItems, worldScenePlacements, shopItems } from "../shared/schema";
import { registerWorldSceneContentRoutes } from "../server/routes/worldSceneContent.routes";
import { registerPetParkAdminRoutes } from "../server/routes/petParkAdmin.routes";
import { loadSceneMiniPets } from "../server/sceneMiniPets";

const id = "10000000-0000-4000-8000-000000000001";
const petId = "10000000-0000-4000-8000-000000000002";
const pet: SceneMiniPet = {
  shopItemId: petId, name: "Willow Wisp", imageUrl: "/wisp.webp", animationStyle: "float",
  parts: [{ id: "eyes", partType: "eyes", imageUrl: "/eyes.webp" },
    { id: "closed", partType: "closed_eyes", imageUrl: "/closed.webp" }],
};
const transform = { xPct: .45, yPct: .42, size: 88, flipped: false, layer: 0 };
const miniPlacement = { ...transform, kind: "mini_pet", miniPetId: petId };

function setup(kind = "mini_pet", catalog = true) {
  const row = { id, kind, ...transform, decorSurface: "barrier", isWaterSource: false, miniPetId: kind === "mini_pet" ? petId : null };
  const routes = new Map<string, Function[]>();
  const writes: { table: unknown; value: any }[] = [];
  const reads: unknown[] = [];
  const guard = (_req: unknown, _res: unknown, next: Function) => next();
  const app = Object.fromEntries(["get", "post", "patch", "put", "delete"].map(method =>
    [method, (path: string, ...handlers: Function[]) => routes.set(method + " " + path, handlers)]));
  const db = {
    select(fields?: any) {
      return { from(table: unknown) {
        reads.push(table);
        const result = table === miniPetDefinitions ? (catalog ? [{ ...pet, parts: undefined }] : [])
          : table === miniPetParts ? [...pet.parts.map(part => ({ ...part, shopItemId: petId })),
            { id: "bad-layer", partType: "unknown", imageUrl: "/unused", shopItemId: petId }]
          : table === shopItems ? (catalog ? [{ id: petId }] : [])
          : fields?.total ? [{ total: 1 }] : [row];
        const where = () => Object.assign(Promise.resolve(result), { limit: async () => result });
        return { where, innerJoin: () => ({ where }) };
      } };
    },
    insert(table: unknown) { return { values(value: any) {
      writes.push({ table, value });
      return { returning: async () => [{ id, ...value }] };
    } }; },
    update(table: unknown) { return { set(value: any) {
      return { where: () => ({ returning: async () => {
        if (table === petParkSceneItems && kind !== "mini_pet") return [];
        writes.push({ table, value }); return [{ ...row, ...value }];
      } }) };
    } }; },
    async transaction(fn: (tx: any) => Promise<unknown>) { return fn(db); },
  };
  const options = { db: db as any, isAdmin: guard as any, processWorldImage: async () => { throw new Error("Catalog placement must not process images"); } };
  registerWorldSceneContentRoutes(app as any, options);
  registerPetParkAdminRoutes(app as any, options);
  const invoke = async (method: string, route: string, body: unknown) => {
    const handlers = routes.get(method + " " + route)!;
    assert.equal(handlers[0], guard, "scenery writes must use admin guard");
    const reply = { code: 200, body: undefined as any, status(code: number) { this.code = code; return this; }, json(body: any) { this.body = body; return this; } };
    await handlers.at(-1)!({ body, params: { worldId: "swamp", placementId: id, id } }, reply);
    return reply;
  };
  return { invoke, writes, reads, db };
}
const world = "/api/admin/world-editor/:worldId/placements";
const park = "/api/admin/pet-park/items";

test("Mini Pet scene reads are batched and contain only catalog artwork, no player inventory", async () => {
  const t = setup();
  assert.deepEqual(await loadSceneMiniPets(t.db as any, [null, undefined]), []);
  assert.deepEqual(t.reads, []);
  assert.deepEqual(await loadSceneMiniPets(t.db as any, [petId, petId]), [pet]);
  assert.deepEqual(t.reads, [miniPetDefinitions, miniPetParts]);
});

test("both editors place a catalog Mini Pet and keep its animation and anchor separately", async () => {
  for (const [route, table] of [[world, worldScenePlacements], [park, petParkSceneItems]] as const) {
    const t = setup();
    const result = await t.invoke("post", route, miniPlacement);
    assert.equal(result.code, 201);
    assert.equal(result.body.miniPetId, petId);
    assert.equal(result.body.idleAnimation, "float", "existing catalog default");
    assert.equal(result.body.xPct, transform.xPct);
    assert.equal(result.body.size, 88);
    assert.equal(result.body.imageUrl ?? result.body.assetId ?? null, null, "no copied asset");
    assert.equal(t.writes.length, 1);
    assert.equal(t.writes[0].table, table);
    assert.equal((await t.invoke("post", route, { ...miniPlacement, idleAnimation: "breath" })).body.idleAnimation, "breath");
    for (const invalid of [
      { ...miniPlacement, miniPetId: null }, { ...miniPlacement, miniPetId: "fake" },
      { ...miniPlacement, idleAnimation: "spin" }, { ...miniPlacement, kind: "decor" },
      { ...miniPlacement, effectType: "lamp_light" },
      { ...miniPlacement, isWaterSource: true },
    ]) assert.equal((await t.invoke("post", route, invalid)).code, 400);
    assert.equal(t.writes.length, 2);
    const missing = setup("mini_pet", false);
    assert.equal((await missing.invoke("post", route, miniPlacement)).code, 400);
    assert.equal(missing.writes.length, 0);
  }
});

test("admin idle animation PATCH saves only that field and rejects decoration or invalid motion", async () => {
  for (const kind of ["mini_pet", "npc", "decor", "effect"]) {
    const t = setup(kind);
    const result = await t.invoke("patch", world + "/:placementId", { idleAnimation: "float" });
    if (kind === "mini_pet" || kind === "npc") {
      assert.equal(result.code, 200);
      assert.deepEqual(t.writes, [{ table: worldScenePlacements, value: { idleAnimation: "float" } }]);
      assert.equal(result.body.xPct, transform.xPct);
    } else {
      assert.equal(result.code, 400);
      assert.deepEqual(t.writes, []);
    }
    assert.equal((await t.invoke("patch", world + "/:placementId", { idleAnimation: "walk" })).code, 400);
  }
  const t = setup();
  assert.equal((await t.invoke("patch", park + "/:id/idle-animation", { idleAnimation: "breath" })).code, 200);
  assert.deepEqual(t.writes, [{ table: petParkSceneItems, value: { idleAnimation: "breath" } }]);
  assert.equal((await t.invoke("patch", park + "/:id/idle-animation", { idleAnimation: "walk" })).code, 400);
  assert.equal((await setup("decor").invoke("patch", park + "/:id/idle-animation", { idleAnimation: "float" })).code, 404);
});

test("legacy NPCs default to breathing; new NPCs retain stable catalog references", async () => {
  assert.equal(sceneIdleAnimation(null), "breath");
  assert.equal(sceneIdleAnimation(undefined, "float"), "float");
  assert.equal(isMiniPetAnimation("spin"), false);
  const t = setup("npc");
  const result = await t.invoke("post", world, { ...transform, kind: "npc", npcId: petId });
  assert.equal(result.code, 201);
  assert.equal(result.body.npcId, petId);
  assert.equal(result.body.idleAnimation, "breath");
  assert.equal(result.body.miniPetId, null);
});

test("world unlock audits missing mini-pet catalog art without changing older NPC requirements", () => {
  const input = { hasGround: true, placements: [{ ...miniPlacement, id, assetId: null, npcId: null, legacyLocationId: null, isShop: false }],
    assets: [], npcs: [], locations: [] };
  assert.deepEqual(auditWorldActivation("swamp", { ...input, miniPets: [pet] }), []);
  assert.match(auditWorldActivation("swamp", input).join(" "), /Mini Pet/);
});

test("boot changes add nullable reference and idle fields without altering saved placements", () => {
  for (const file of ["ensureWorldSceneContentStorage", "ensurePetParkStorage"]) {
    const source = readFileSync(`server/startup/migrations/${file}.ts`, "utf8");
    assert.match(source, /ADD COLUMN IF NOT EXISTS mini_pet_id varchar REFERENCES shop_items\(id\) ON DELETE CASCADE/);
    assert.match(source, /ADD COLUMN IF NOT EXISTS idle_animation text CHECK/);
    assert.match(source, /idle_animation IN \('breath', 'float'\)/);
    assert.match(source, /kind IN \([^\n]*'mini_pet'/);
  }
});

test("scenery Mini Pets neither consume resting spots nor displace visiting pets", () => {
  const visitors = [{ petInventoryId: "player-owned-pet" }];
  const placed = { kind: "mini_pet" as const, xPct: .5, yPct: .5, size: 1000 };
  assert.deepEqual(arrangeParkVisitors(visitors, [placed]), arrangeParkVisitors(visitors, []));
  assert.equal(isParkSleepPosition({ x: .5, y: .5 }, [placed], {width:1000,height:1000}), false);
});
