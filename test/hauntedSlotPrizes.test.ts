import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { getSlotPrizeCatalog, getSlotPrizeOptions, parseSlotPrizeIds, saveSlotPrizeSelection, slotPrizePreviews, type CasinoPrizeItem } from "../server/hauntedSlotPrizes";
import { spinHauntedSlots } from "../server/hauntedCasino";
import { registerHauntedCasinoRoutes } from "../server/routes/hauntedCasino.routes";

const item = (id: string, type: string): CasinoPrizeItem => ({
  id, type, name: id, image_url: `${id}.png`, egg_image_url: type === "pet" ? `${id}-egg.png` : null,
  price: 10, rarity: 1, star_rarity: 1, fishing_type: null,
});

function fixture() {
  const dialect = new PgDialect();
  const options = [item("treat", "edibles"), item("gift", "gift"), item("egg-a", "pet"), item("egg-b", "pet")];
  const settings = new Map<string, string>();
  let coins = 100;
  let inventory: string[] = [];
  let failWallet = false;
  let queue: Promise<unknown> = Promise.resolve();
  const tx = {
    async execute(query: any) {
      const { sql, params } = dialect.sqlToQuery(query);
      if (sql.includes("SELECT value FROM game_settings")) return { rows: settings.has(String(params[0])) ? [{ value: settings.get(String(params[0])) }] : [] };
      if (sql.includes("FROM shop_items")) {
        if (!sql.includes("ANY(")) return { rows: options };
        const [eggs, items] = params as [string[], string[] | undefined];
        return { rows: options.filter(option => option.type === "pet" ? eggs.includes(option.id) : items ? items.includes(option.id) : option.price > 0) };
      }
      if (sql.includes("INSERT INTO game_settings")) { settings.set(String(params[0]), String(params[1])); return { rows: [] }; }
      if (sql.includes("SELECT id, coins, essence")) {
        assert.match(sql, /FOR UPDATE/);
        return { rows: [{ id: "player", coins, essence: 0 }] };
      }
      if (sql.includes("INSERT INTO user_inventory")) {
        assert.deepEqual(params, ["player", "egg-a"]);
        assert.match(sql, /quantity, is_hatched, hatch_started_at/);
        assert.match(sql, /1, false, NOW\(\)/);
        inventory.push(String(params[1]));
        return { rows: [] };
      }
      if (sql.includes("UPDATE users")) {
        if (failWallet) throw new Error("wallet unavailable");
        coins = coins - Number(params[0]) + Number(params[1]);
        return { rows: [{ coins, essence: Number(params[2]) }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const database = {
    transaction(fn: (executor: any) => Promise<any>) {
      const next = queue.then(async () => {
        const before = { coins, inventory: [...inventory] };
        try { return await fn(tx); } catch (error) { coins = before.coins; inventory = before.inventory; throw error; }
      });
      queue = next.catch(() => {});
      return next;
    },
  };
  return { tx, database: database as any, settings, options, state: () => ({ coins, inventory }), failWallet: () => { failWallet = true; }, setCoins: (value: number) => { coins = value; } };
}

test("admin selections persist independently and only selected eggs and items can win", async () => {
  const f = fixture();
  assert.equal((await getSlotPrizeCatalog(f.tx)).egg.length, 0);
  await saveSlotPrizeSelection(f.tx, "items", ["gift"]);
  await saveSlotPrizeSelection(f.tx, "eggs", ["egg-a"]);
  const catalog = await getSlotPrizeCatalog(f.tx);
  assert.deepEqual(catalog.loot.map(value => value.id), ["gift"]);
  assert.deepEqual(catalog.edible, []);
  assert.deepEqual(catalog.egg.map(value => value.id), ["egg-a"]);
  assert.deepEqual((await getSlotPrizeOptions(f.tx)).selectedItemIds, ["gift"]);
  await saveSlotPrizeSelection(f.tx, "eggs", []);
  assert.deepEqual((await getSlotPrizeCatalog(f.tx)).egg, []);
  assert.deepEqual((await getSlotPrizeCatalog(f.tx)).loot.map(value => value.id), ["gift"]);
});

test("invalid, deleted, or wrong-kind prizes cannot be configured", async () => {
  const f = fixture();
  assert.deepEqual(parseSlotPrizeIds(["a", "a"]), ["a"]);
  for (const input of [null, "a", [null], [""], Array(501).fill("a")]) assert.throws(() => parseSlotPrizeIds(input));
  await assert.rejects(saveSlotPrizeSelection(f.tx, "items", ["egg-a"]));
  await assert.rejects(saveSlotPrizeSelection(f.tx, "eggs", ["gift"]));
  await assert.rejects(saveSlotPrizeSelection(f.tx, "eggs", ["deleted"]));
  assert.equal(f.settings.size, 0);
});

test("public prize previews show only eligible selections and use the actual egg artwork", async () => {
  const f = fixture();
  await saveSlotPrizeSelection(f.tx, "items", ["gift"]);
  await saveSlotPrizeSelection(f.tx, "eggs", ["egg-a"]);
  assert.deepEqual(slotPrizePreviews(await getSlotPrizeCatalog(f.tx)), [
    { id: "gift", name: "gift", imageUrl: "gift.png", category: "loot" },
    { id: "egg-a", name: "egg-a", imageUrl: "egg-a-egg.png", category: "egg" },
  ]);
  // Removing a catalog entry also removes it from the public preview.
  f.options.splice(f.options.findIndex(option => option.id === "gift"), 1);
  assert.deepEqual(slotPrizePreviews(await getSlotPrizeCatalog(f.tx)).map(prize => prize.id), ["egg-a"]);
  await saveSlotPrizeSelection(f.tx, "eggs", []);
  assert.deepEqual(slotPrizePreviews(await getSlotPrizeCatalog(f.tx)), []);
});

test("cleared or malformed item settings never restore the default prize pool", async () => {
  const f = fixture();
  await saveSlotPrizeSelection(f.tx, "items", []);
  assert.deepEqual((await getSlotPrizeCatalog(f.tx)).loot, []);
  f.settings.set("haunted_slots_item_prizes_v1", "broken-json");
  assert.deepEqual((await getSlotPrizeCatalog(f.tx)).edible, []);
});

test("three eggs grant exactly one selected unhatched egg in the wallet transaction", async () => {
  const f = fixture();
  await saveSlotPrizeSelection(f.tx, "items", []);
  await saveSlotPrizeSelection(f.tx, "eggs", ["egg-a"]);
  const result = await spinHauntedSlots("player", 10, f.database, () => 66);
  assert.deepEqual(result.reels, ["egg", "egg", "egg"]);
  assert.equal(result.reward.itemGranted?.id, "egg-a");
  assert.equal(result.reward.itemGranted?.imageUrl, "egg-a-egg.png");
  assert.deepEqual(f.state(), { coins: 100, inventory: ["egg-a"] });
});

test("failed wallet credit rolls back the egg grant", async () => {
  const f = fixture();
  await saveSlotPrizeSelection(f.tx, "items", []);
  await saveSlotPrizeSelection(f.tx, "eggs", ["egg-a"]);
  f.failWallet();
  await assert.rejects(spinHauntedSlots("player", 10, f.database, () => 66), /wallet unavailable/);
  assert.deepEqual(f.state(), { coins: 100, inventory: [] });
});

test("empty egg selections omit the egg symbol, and insufficient funds cannot grant prizes", async () => {
  const f = fixture();
  const result = await spinHauntedSlots("player", 10, f.database, () => 0);
  assert.ok(result.symbols.every(symbol => symbol.id !== "egg"));
  f.setCoins(0);
  await assert.rejects(spinHauntedSlots("player", 10, f.database), /Not enough coins/);
  assert.deepEqual(f.state().inventory, []);
});

test("non-admin requests cannot read or change slot prize selections", async () => {
  const handlers = new Map<string, Function>();
  const app = Object.fromEntries(["get", "put", "post"].map(method => [method, (path: string, ...fns: Function[]) => handlers.set(`${method} ${path}`, fns.at(-1)!)]));
  registerHauntedCasinoRoutes(app as any, { isAuthenticated: (() => {}) as any });
  for (const key of ["get /api/admin/haunted-casino/prizes", "put /api/admin/haunted-casino/prizes/:kind"]) {
    let status = 200;
    const response = { status(value: number) { status = value; return this; }, json(value: unknown) { return value; } };
    await handlers.get(key)!({ user: { id: "player", isAdmin: false }, params: { kind: "eggs" }, body: { ids: ["egg-a"] } }, response);
    assert.equal(status, 403);
  }
});
