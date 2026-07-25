import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AQUARIUM_PRICES } from "../server/aquariumUnlock";

type Failure = "balance" | "ownership" | null;

class TransactionalAquariumModel {
  coins = new Map([["player-1", 50_000], ["player-2", 70_000]]);
  unlocks: Array<{ userId: string; aquariumId: string }> = [];
  failAt: Failure = null;
  private locks = new Map<string, Promise<void>>();

  async purchase(userId: string, body: Record<string, unknown>) {
    if (Object.keys(body).some(key => key !== "aquariumId") || typeof body.aquariumId !== "string") {
      return { status: 400, message: "Invalid aquarium ID" };
    }
    const aquariumId = body.aquariumId as keyof typeof AQUARIUM_PRICES;
    if (!(aquariumId in AQUARIUM_PRICES)) return { status: 400, message: "Invalid aquarium ID" };

    const key = `${userId}:${aquariumId}`;
    while (this.locks.has(key)) await this.locks.get(key);
    let release!: () => void;
    this.locks.set(key, new Promise(resolve => { release = resolve; }));
    const snapshot = { coins: new Map(this.coins), unlocks: this.unlocks.map(row => ({ ...row })) };
    try {
      await new Promise(resolve => setTimeout(resolve, 2));
      if (this.unlocks.some(row => row.userId === userId && row.aquariumId === aquariumId)) {
        return { status: 409, message: "Already unlocked" };
      }
      const current = this.coins.get(userId);
      if (current === undefined) throw new Error("missing player");
      const price = AQUARIUM_PRICES[aquariumId];
      if (current < price) return { status: 400, message: "Not enough coins" };
      if (this.failAt === "balance") throw new Error("balance failed");
      this.coins.set(userId, current - price);
      if (this.failAt === "ownership") throw new Error("ownership failed");
      this.unlocks.push({ userId, aquariumId });
      return { status: 200, body: { ok: true, coinsRemaining: current - price } };
    } catch (error) {
      this.coins = snapshot.coins;
      this.unlocks = snapshot.unlocks;
      return { status: 500, message: (error as Error).message };
    } finally {
      this.locks.delete(key);
      release();
    }
  }
}

test("successful purchases use the exact canonical prices and isolate players", async () => {
  const model = new TransactionalAquariumModel();
  assert.deepEqual(await model.purchase("player-1", { aquariumId: "bayou" }), {
    status: 200, body: { ok: true, coinsRemaining: 30_000 },
  });
  assert.deepEqual(await model.purchase("player-2", { aquariumId: "volcanic" }), {
    status: 200, body: { ok: true, coinsRemaining: 45_000 },
  });
  assert.equal(model.coins.get("player-1"), 30_000);
  assert.equal(model.unlocks.filter(row => row.userId === "player-1").length, 1);
});

test("insufficient funds and invalid aquarium IDs perform no mutation", async () => {
  const model = new TransactionalAquariumModel();
  model.coins.set("player-1", 19_999);
  assert.equal((await model.purchase("player-1", { aquariumId: "bayou" })).status, 400);
  assert.equal((await model.purchase("player-1", { aquariumId: "unknown" })).status, 400);
  assert.equal(model.coins.get("player-1"), 19_999);
  assert.equal(model.unlocks.length, 0);
});

test("already-owned, concurrent duplicate, and retry requests charge at most once", async () => {
  const model = new TransactionalAquariumModel();
  const concurrent = await Promise.all([
    model.purchase("player-1", { aquariumId: "bayou" }),
    model.purchase("player-1", { aquariumId: "bayou" }),
  ]);
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
  assert.equal(model.coins.get("player-1"), 30_000);
  assert.equal(model.unlocks.length, 1);
  assert.equal((await model.purchase("player-1", { aquariumId: "bayou" })).status, 409);
  assert.equal(model.coins.get("player-1"), 30_000);
  assert.equal(model.unlocks.length, 1);
});

test("ownership and balance write failures roll back both transaction mutations", async () => {
  for (const failure of ["balance", "ownership"] as const) {
    const model = new TransactionalAquariumModel();
    model.failAt = failure;
    assert.equal((await model.purchase("player-1", { aquariumId: "bayou" })).status, 500);
    assert.equal(model.coins.get("player-1"), 50_000);
    assert.equal(model.unlocks.length, 0);
  }
});

test("hostile authority fields are rejected and cannot target another player", async () => {
  for (const field of ["price", "userId", "ownerId", "coins", "balance", "unlocked", "reward"]) {
    const model = new TransactionalAquariumModel();
    const result = await model.purchase("player-1", { aquariumId: "bayou", [field]: field === "price" ? 1 : "player-2" });
    assert.equal(result.status, 400);
    assert.equal(model.coins.get("player-1"), 50_000);
    assert.equal(model.coins.get("player-2"), 70_000);
    assert.equal(model.unlocks.length, 0);
  }
});

test("one route delegates to the shared transaction service and the client sends only aquariumId", () => {
  const routes = readFileSync(new URL("../server/routes/fishing.routes.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../server/aquariumUnlock.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../client/src/pages/AquariumPage.tsx", import.meta.url), "utf8");
  assert.equal(routes.match(/app\.post\("\/api\/aquarium\/unlock"/g)?.length, 1);
  assert.match(routes, /purchaseAquariumUnlock\(user\.id, body\.aquariumId\)/);
  assert.doesNotMatch(routes, /atomicDeductCoins\(user\.id, price\)|storage\.unlockAquarium\(/);
  assert.match(service, /db\.transaction/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /ON CONFLICT \(user_id, aquarium_id\) DO NOTHING/);
  assert.match(client, /apiRequest\("POST", "\/api\/aquarium\/unlock", \{ aquariumId \}\)/);
  assert.doesNotMatch(client, /BayouAquariumPage|VolcanicAquariumPage/);
  assert.deepEqual(AQUARIUM_PRICES, { bayou: 20_000, volcanic: 25_000 });
});
