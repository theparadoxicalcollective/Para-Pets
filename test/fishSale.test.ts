import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FISH_SELL_PRICES } from "../server/fishSale";

type Fish = { id: string; userId: string; rarity: number; inAquarium?: boolean; validCatalog?: boolean };

class TransactionalSaleModel {
  coins = new Map([["player-1", 100], ["player-2", 500]]);
  fish: Fish[] = [
    { id: "fish-1", userId: "player-1", rarity: 3, validCatalog: true },
    { id: "fish-2", userId: "player-1", rarity: 1, validCatalog: true },
    { id: "fish-tank", userId: "player-1", rarity: 5, inAquarium: true, validCatalog: true },
    { id: "other-fish", userId: "player-2", rarity: 5, validCatalog: true },
  ];
  questProgress = 0;
  failAt: "inventory" | "coins" | null = null;
  private locks = new Map<string, Promise<void>>();

  async sell(authenticatedUser: string | null, body: Record<string, unknown>) {
    if (!authenticatedUser) return { status: 401, body: { message: "Unauthorized" } };
    const fishIds = body.fishIds;
    if (!Array.isArray(fishIds) || fishIds.length === 0 || fishIds.some(id => typeof id !== "string" || !id)) {
      return { status: 400, body: { message: "fishIds array required" } };
    }
    if (new Set(fishIds).size !== fishIds.length) return { status: 400, body: { message: "duplicate" } };

    const key = authenticatedUser;
    while (this.locks.has(key)) await this.locks.get(key);
    let unlock!: () => void;
    this.locks.set(key, new Promise(resolve => { unlock = resolve; }));
    const snapshot = { fish: this.fish.map(f => ({ ...f })), coins: new Map(this.coins), quest: this.questProgress };
    try {
      // Yield while holding the transaction lock so concurrent tests overlap.
      await new Promise(resolve => setTimeout(resolve, 2));
      const rows = this.fish.filter(f => (fishIds as string[]).includes(f.id));
      if (rows.length !== fishIds.length || rows.some(f => f.userId !== authenticatedUser)) {
        return { status: 404, body: { message: "Fish not found" } };
      }
      if (rows.some(f => f.inAquarium)) return { status: 409, body: { message: "Fish is unavailable for sale" } };
      if (rows.some(f => !f.validCatalog)) return { status: 404, body: { message: "Fish not found" } };
      const earned = rows.reduce((sum, f) => sum + (FISH_SELL_PRICES[f.rarity] ?? 5), 0);
      if (this.failAt === "inventory") throw new Error("inventory failed");
      this.fish = this.fish.filter(f => !(fishIds as string[]).includes(f.id));
      if (this.failAt === "coins") throw new Error("coins failed");
      const balance = this.coins.get(authenticatedUser)! + earned;
      this.coins.set(authenticatedUser, balance);
      this.questProgress += rows.length;
      return { status: 200, body: { sold: rows.length, coinsEarned: earned, newBalance: balance } };
    } catch (error) {
      this.fish = snapshot.fish;
      this.coins = snapshot.coins;
      this.questProgress = snapshot.quest;
      return { status: 500, body: { message: (error as Error).message } };
    } finally {
      this.locks.delete(key);
      unlock();
    }
  }
}

test("normal sale uses exact owned records, authoritative rarity prices, and preserves unrelated state", async () => {
  const model = new TransactionalSaleModel();
  const result = await model.sell("player-1", {
    fishIds: ["fish-1", "fish-2"], price: 999999, rarity: 5, userId: "player-2", ownerId: "player-2",
  });
  assert.deepEqual(result, { status: 200, body: { sold: 2, coinsEarned: 20, newBalance: 120 } });
  assert.deepEqual(model.fish.map(f => f.id), ["fish-tank", "other-fish"]);
  assert.equal(model.coins.get("player-2"), 500);
  assert.equal(model.questProgress, 2);
});

test("authentication, exact ownership, existence, aquarium state, and duplicate quantities are enforced", async () => {
  for (const [user, body, status] of [
    [null, { fishIds: ["fish-1"] }, 401],
    ["player-1", { fishIds: ["missing"] }, 404],
    ["player-1", { fishIds: ["other-fish"] }, 404],
    ["player-1", { fishIds: ["fish-tank"] }, 409],
    ["player-1", { fishIds: [] }, 400],
    ["player-1", { fishIds: ["fish-1", "fish-1"] }, 400],
  ] as const) {
    const model = new TransactionalSaleModel();
    assert.equal((await model.sell(user, body)).status, status);
    assert.equal(model.coins.get("player-1"), 100);
    assert.equal(model.fish.length, 4);
  }
});

test("numeric quantity injection cannot sell zero, negative, decimal, or excess units", async () => {
  for (const quantity of [0, -1, 0.5, 99]) {
    const model = new TransactionalSaleModel();
    const result = await model.sell("player-1", { fishIds: [], quantity });
    assert.equal(result.status, 400);
    assert.equal(model.coins.get("player-1"), 100);
  }
});

test("overlapping final-unit sales pay exactly once and retry cannot pay again", async () => {
  const model = new TransactionalSaleModel();
  const results = await Promise.all([
    model.sell("player-1", { fishIds: ["fish-1"] }),
    model.sell("player-1", { fishIds: ["fish-1"] }),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 404]);
  assert.equal(model.coins.get("player-1"), 115);
  assert.equal((await model.sell("player-1", { fishIds: ["fish-1"] })).status, 404);
  assert.equal(model.coins.get("player-1"), 115);
});

test("inventory and coin failures roll back fish, balance, and quest progress", async () => {
  for (const failure of ["inventory", "coins"] as const) {
    const model = new TransactionalSaleModel();
    model.failAt = failure;
    assert.equal((await model.sell("player-1", { fishIds: ["fish-1"] })).status, 500);
    assert.ok(model.fish.some(f => f.id === "fish-1"));
    assert.equal(model.coins.get("player-1"), 100);
    assert.equal(model.questProgress, 0);
  }
});

test("registered route delegates only to the transactional helper and market remains separate", () => {
  const routes = readFileSync(new URL("../server/routes/fishing.routes.ts", import.meta.url), "utf8");
  const rootRoutes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../server/fishSale.ts", import.meta.url), "utf8");
  const saleRoute = routes.slice(routes.indexOf('app.post("/api/fishing/sell"'), routes.indexOf("// ── PvP Arena Routes"));
  assert.match(saleRoute, /isAuthenticated/);
  assert.match(saleRoute, /sellFish\(user\.id, fishIds\)/);
  assert.doesNotMatch(saleRoute, /storage\.(deleteFishInventoryItems|addCoins|getPlayerFishInventory)/);
  assert.match(service, /db\.transaction/);
  assert.match(service, /\.for\("update"\)/);
  assert.match(service, /\.for\("update", \{ of: playerFishInventory \}\)/);
  assert.match(service, /fish\.ownerId !== userId/);
  assert.match(service, /FISH_SELL_PRICES\[fish\.starRarity/);
  assert.equal(routes.match(/app\.post\("\/api\/fishing\/sell"/g)?.length, 1);
  assert.match(rootRoutes, /app\.post\("\/api\/market\/list-fish"/);
  assert.doesNotMatch(rootRoutes.slice(rootRoutes.indexOf('app.post("/api/market/list-fish"')), /sellFish\(/);
});
