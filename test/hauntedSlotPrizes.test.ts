import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { getSlotPrizeCatalog, getSlotPrizeOptions, parseSlotPrizeIds, saveSlotPrizeSelection, slotPrizePreviews, type CasinoPrizeItem } from "../server/hauntedSlotPrizes";
import { casinoDay, eligibleSlotCatalog, pickPrizeItem, spinHauntedSlots } from "../server/hauntedCasino";
import { registerHauntedCasinoRoutes } from "../server/routes/hauntedCasino.routes";

const PVP_TICKET_ID = "a1b2c3d4-9001-4000-8000-000000000099";

const item = (id: string, type: string, overrides: Partial<CasinoPrizeItem> = {}): CasinoPrizeItem => ({
  id, type, name: id, image_url: `${id}.png`, egg_image_url: type === "pet" ? `${id}-egg.png` : null,
  price: 10, rarity: 1, star_rarity: 1, fishing_type: null, ...overrides,
});

function fixture() {
  const dialect = new PgDialect();
  const options = [
    item("treat", "edibles"),
    item("gift", "gift"),
    item("no-art-item", "item", { image_url: null }),
    item(PVP_TICKET_ID, "item", { name: "PvP Ticket" }),
    item("legacy-ticket", "ticket", { name: "Arena Pass" }),
    item("egg-a", "pet"),
    item("egg-b", "pet"),
  ];
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
        const ticketId = String(params[0]);
        const eligible = options.filter(option => option.id !== ticketId && !option.name.toLowerCase().includes("ticket") && !option.type.toLowerCase().includes("ticket"));
        if (!sql.includes("ANY(")) return { rows: eligible };
        const selections = params.filter(Array.isArray) as string[][];
        const eggs = selections[0] ?? [];
        const items = selections[1];
        return { rows: eligible.filter(option => option.type === "pet" ? eggs.includes(option.id) : items ? items.includes(option.id) : option.price > 0) };
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
      if (sql.includes("SELECT COALESCE(SUM(quantity)")) return { rows: [{ total: 0 }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const database = {
    transaction(fn: (executor: any) => Promise<any>) {
      const next = queue.then(async () => {
        const before = { coins, inventory: [...inventory], settings: new Map(settings) };
        try { return await fn(tx); } catch (error) { coins = before.coins; inventory = before.inventory; settings.clear(); for (const [key, value] of before.settings) settings.set(key, value); throw error; }
      });
      queue = next.catch(() => {});
      return next;
    },
  };
  return { tx, database: database as any, settings, options, state: () => ({ coins, inventory }), failWallet: () => { failWallet = true; }, setCoins: (value: number) => { coins = value; } };
}

test("admin selections persist independently and reopen with the exact saved eggs and items", async () => {
  const f = fixture();
  assert.equal((await getSlotPrizeCatalog(f.tx)).egg.length, 0);
  await saveSlotPrizeSelection(f.tx, "items", ["gift", "no-art-item"]);
  await saveSlotPrizeSelection(f.tx, "eggs", ["egg-a"]);
  const catalog = await getSlotPrizeCatalog(f.tx);
  assert.deepEqual(catalog.loot.map(value => value.id), ["gift", "no-art-item"]);
  assert.deepEqual(catalog.edible, []);
  assert.deepEqual(catalog.egg.map(value => value.id), ["egg-a"]);
  const editOptions = await getSlotPrizeOptions(f.tx);
  assert.deepEqual(editOptions.selectedItemIds, ["gift", "no-art-item"]);
  assert.deepEqual(editOptions.selectedEggIds, ["egg-a"]);
  assert.ok(editOptions.items.some(value => value.id === "no-art-item" && value.image_url === null));
  await saveSlotPrizeSelection(f.tx, "eggs", []);
  assert.deepEqual((await getSlotPrizeCatalog(f.tx)).egg, []);
  assert.deepEqual((await getSlotPrizeCatalog(f.tx)).loot.map(value => value.id), ["gift", "no-art-item"]);
});

test("invalid, deleted, wrong-kind, and PvP ticket prizes cannot be configured", async () => {
  const f = fixture();
  assert.deepEqual(parseSlotPrizeIds(["a", "a"]), ["a"]);
  for (const input of [null, "a", [null], [""], Array(501).fill("a")]) assert.throws(() => parseSlotPrizeIds(input));
  await assert.rejects(saveSlotPrizeSelection(f.tx, "items", ["egg-a"]));
  await assert.rejects(saveSlotPrizeSelection(f.tx, "eggs", ["gift"]));
  await assert.rejects(saveSlotPrizeSelection(f.tx, "eggs", ["deleted"]));
  await assert.rejects(saveSlotPrizeSelection(f.tx, "items", [PVP_TICKET_ID]));
  await assert.rejects(saveSlotPrizeSelection(f.tx, "items", ["legacy-ticket"]));
  assert.equal(f.settings.size, 0);
});

test("public prize previews mirror the saved catalog, including items without artwork", async () => {
  const f = fixture();
  await saveSlotPrizeSelection(f.tx, "items", ["gift", "no-art-item"]);
  await saveSlotPrizeSelection(f.tx, "eggs", ["egg-a"]);
  assert.deepEqual(slotPrizePreviews(await getSlotPrizeCatalog(f.tx)), [
    { id: "gift", name: "gift", imageUrl: "gift.png", category: "loot", rarity: 1 },
    { id: "no-art-item", name: "no-art-item", imageUrl: null, category: "loot", rarity: 1 },
    { id: "egg-a", name: "egg-a", imageUrl: "egg-a-egg.png", category: "egg", rarity: 1 },
  ]);
  // Removing a catalog entry also removes it from the public preview.
  f.options.splice(f.options.findIndex(option => option.id === "gift"), 1);
  assert.deepEqual(slotPrizePreviews(await getSlotPrizeCatalog(f.tx)).map(prize => prize.id), ["no-art-item", "egg-a"]);
  await saveSlotPrizeSelection(f.tx, "eggs", []);
  assert.deepEqual(slotPrizePreviews(await getSlotPrizeCatalog(f.tx)).map(prize => prize.id), ["no-art-item"]);
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
  const result = await spinHauntedSlots("player", 50, false, f.database, () => 66);
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
  await assert.rejects(spinHauntedSlots("player", 50, false, f.database, () => 66), /wallet unavailable/);
  assert.deepEqual(f.state(), { coins: 100, inventory: [] });
});

test("empty egg selections omit the egg symbol, and insufficient funds cannot grant prizes", async () => {
  const f = fixture();
  const result = await spinHauntedSlots("player", 50, false, f.database, () => 0);
  assert.ok(result.symbols.every(symbol => symbol.id !== "egg"));
  f.setCoins(0);
  await assert.rejects(spinHauntedSlots("player", 50, false, f.database), /Not enough coins/);
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

test("high stakes award rare catalog prizes only; low stakes favor common and uncommon", () => {
  const common = item("common", "item", { star_rarity: 1 });
  const uncommon = item("uncommon", "item", { star_rarity: 2 });
  const rare = item("rare", "item", { star_rarity: 3 });
  const rareEgg = item("rare-egg", "pet", { star_rarity: 4 });
  const catalog = { edible: [], loot: [common, uncommon, rare], egg: [rareEgg] };
  const low = eligibleSlotCatalog(catalog, 50);
  assert.deepEqual(low.loot.map(prize => prize.id), ["common", "uncommon", "rare"]);
  assert.deepEqual(low.egg, []);
  assert.equal(pickPrizeItem(low.loot, 50, () => 0)?.id, "common");
  assert.equal(pickPrizeItem(low.loot, 500, max => max === 10 ? 9 : 0)?.id, "rare");
  const high = eligibleSlotCatalog(catalog, 1000);
  assert.deepEqual(high.loot.map(prize => prize.id), ["rare"]);
  assert.deepEqual(high.egg.map(prize => prize.id), ["rare-egg"]);
  assert.equal(pickPrizeItem(high.loot, 5000, () => 0)?.id, "rare");
  assert.equal(pickPrizeItem([common], 5000, () => 0), null);
});

test("the free 500 spin is available once per Chicago day and costs zero coins", async () => {
  const f = fixture();
  f.setCoins(0);
  const first = await spinHauntedSlots("player", 500, true, f.database, () => 0);
  assert.equal(first.wasFree, true);
  assert.equal(first.freeSpinAvailable, false);
  assert.equal(f.state().coins, first.reward.coins);
  await assert.rejects(spinHauntedSlots("player", 500, true, f.database, () => 0), /already been used/);
  f.setCoins(0);
  await assert.rejects(spinHauntedSlots("player", 500, false, f.database, () => 0), /Not enough coins/);
  await assert.rejects(spinHauntedSlots("player", 50, true, f.database, () => 0), /free 500 coin spin/);
});

test("a failed free spin does not consume the daily entitlement", async () => {
  const f = fixture();
  f.failWallet();
  await assert.rejects(spinHauntedSlots("player", 500, true, f.database, () => 0), /wallet unavailable/);
  assert.equal([...f.settings.keys()].some(key => key.startsWith("haunted_slots_free_500_v1:")), false);
});

test("daily slot entitlement resets at midnight in the same casino time zone as Beau", () => {
  assert.equal(casinoDay(new Date("2026-09-21T04:59:00Z")), "2026-09-20");
  assert.equal(casinoDay(new Date("2026-09-21T05:01:00Z")), "2026-09-21");
});
