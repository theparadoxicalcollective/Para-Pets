import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { pendingPurchaseSession, clearPendingPurchase, PURCHASE_QUERY_KEYS, PURCHASE_REFRESH_OPTIONS } from "../client/src/lib/purchaseRecovery";

const memoryStore = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

test("failed/lost verification remains retryable on revisit, scoped to the player", () => {
  const store = memoryStore();
  assert.equal(pendingPurchaseSession("alice", "?success=true&session_id=cs_1", store), "cs_1");
  assert.equal(pendingPurchaseSession("alice", "", store), "cs_1");
  assert.equal(pendingPurchaseSession("bob", "", store), null);
  assert.equal(pendingPurchaseSession("alice", "?canceled=true", store), "cs_1");
  clearPendingPurchase("alice", "cs_1", store);
  assert.equal(pendingPurchaseSession("alice", "", store), null);
});

test("a late success cannot clear a newer checkout reference", () => {
  const store = memoryStore();
  pendingPurchaseSession("alice", "?success=true&session_id=cs_1", store);
  pendingPurchaseSession("alice", "?success=true&session_id=cs_2", store);
  clearPendingPurchase("alice", "cs_1", store);
  assert.equal(pendingPurchaseSession("alice", "", store), "cs_2");
});

test("blocked storage still permits verification from the Stripe return URL", () => {
  const denied = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); }, removeItem() { throw Error("denied"); } };
  assert.equal(pendingPurchaseSession("alice", "?success=true&session_id=cs_1", denied), "cs_1");
  assert.equal(pendingPurchaseSession("alice", "?session_id=cs_unconfirmed", denied), null);
  assert.doesNotThrow(() => clearPendingPurchase("alice", "cs_1", denied));
});

test("reopening purchase views fetches fresh data despite the global infinite cache", async () => {
  for (const key of ["/api/admin/coin-purchases", "/api/public/leaderboard", "/api/coins/progress"]) {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    client.setQueryData([key], ["old"]);
    let calls = 0;
    const observer = new QueryObserver(client, { queryKey: [key], queryFn: async () => { calls++; return ["new"]; }, ...PURCHASE_REFRESH_OPTIONS });
    await new Promise<void>(resolve => {
      const unsubscribe = observer.subscribe(result => {
        if (result.data?.[0] === "new" && !result.isFetching) { unsubscribe(); resolve(); }
      });
    });
    assert.equal(calls, 1, key);
    assert.deepEqual(client.getQueryData([key]), ["new"]);
    client.clear();
  }
});

test("verification refreshes Rewards, admin history, progress and leaderboard", () => {
  for (const key of ["/api/rewards/pending", "/api/admin/coin-purchases", "/api/coins/progress", "/api/public/leaderboard"] as const) {
    assert.ok(PURCHASE_QUERY_KEYS.includes(key));
  }
  const page = readFileSync("client/src/pages/CoinShopPage.tsx", "utf8");
  assert.match(page, /for \(const key of PURCHASE_QUERY_KEYS\)/);
  assert.match(page, /Check purchase again/);
  assert.match(page, /Claim your coins and any bonus egg from Rewards/);
  assert.doesNotMatch(page, /Added to your treasury|data\.eggBonus\?\.name/);
  const routes = readFileSync("server/routes.ts", "utf8");
  const verify = routes.slice(routes.indexOf('app.post("/api/coins/verify"'), routes.indexOf('app.get("/api/coins/progress"'));
  assert.ok(verify.indexOf("await maybeAwardAcquisitionBadges") > verify.indexOf("await fulfillStripePurchase"));
  assert.match(verify, /if \(result.status === "fulfilled"\) \{\s*await maybeAwardAcquisitionBadges/);
  assert.match(routes, /points: Number\(r.totalUsd\) \* 10/);
});
