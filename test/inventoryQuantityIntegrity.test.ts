import assert from "node:assert/strict";
import test from "node:test";
import { purchaseInventoryItem } from "../server/inventoryPurchase";

type State = { coins: number; items: number };

function harness(initial: State, options: { failDebit?: boolean; failGrant?: boolean } = {}) {
  let state = { ...initial };
  const operations = {
    async transaction<T>(work: (tx: State) => Promise<T>) {
      const draft = { ...state };
      const result = await work(draft);
      state = draft; // a thrown debit/grant never reaches this commit point
      return result;
    },
    async deductCoins(tx: State, _userId: string, cost: number) {
      if (options.failDebit || tx.coins < cost) return undefined;
      tx.coins -= cost;
      return { id: "player", coins: tx.coins };
    },
    async grant(tx: State, { quantity }: { userId: string; quantity: number }) {
      if (options.failGrant) throw new Error("grant failed");
      tx.items += quantity;
      return { quantity: tx.items };
    },
  };
  return { operations, state: () => state };
}

test("a successful multi-buy debits exactly price times quantity and grants the complete quantity", async () => {
  const store = harness({ coins: 100, items: 4 });
  const result = await purchaseInventoryItem(store.operations, { userId: "player", unitPrice: 7, quantity: 3 });
  assert.deepEqual(result, { ok: true, user: { id: "player", coins: 79 }, inventory: { quantity: 7 }, quantity: 3, totalCost: 21 });
  assert.deepEqual(store.state(), { coins: 79, items: 7 });
});

test("insufficient funds and invalid quantities mutate neither coins nor inventory", async () => {
  const poor = harness({ coins: 5, items: 2 });
  assert.deepEqual(await purchaseInventoryItem(poor.operations, { userId: "player", unitPrice: 6, quantity: 1 }), { ok: false, reason: "insufficient-funds" });
  assert.deepEqual(poor.state(), { coins: 5, items: 2 });

  const invalid = harness({ coins: 100, items: 2 });
  await assert.rejects(() => purchaseInventoryItem(invalid.operations, { userId: "player", unitPrice: 1, quantity: 1.5 }), RangeError);
  assert.deepEqual(invalid.state(), { coins: 100, items: 2 });
});

test("a failed grant rolls back its guarded coin debit", async () => {
  const store = harness({ coins: 100, items: 9 }, { failGrant: true });
  await assert.rejects(() => purchaseInventoryItem(store.operations, { userId: "player", unitPrice: 10, quantity: 3 }), /grant failed/);
  assert.deepEqual(store.state(), { coins: 100, items: 9 });
});

test("a failed debit grants no items", async () => {
  const store = harness({ coins: 100, items: 9 }, { failDebit: true });
  assert.deepEqual(await purchaseInventoryItem(store.operations, { userId: "player", unitPrice: 10, quantity: 3 }), { ok: false, reason: "insufficient-funds" });
  assert.deepEqual(store.state(), { coins: 100, items: 9 });
});
