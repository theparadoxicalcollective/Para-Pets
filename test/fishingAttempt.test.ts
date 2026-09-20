import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FISHING_ATTEMPT_TTL_MS, FISH_POINTS, FishingAttemptError, normalizeFishingAttemptResult, selectAuthoritativeFish } from "../server/fishingAttempt";
import { fishingCompletionOutcome } from "../client/src/lib/fishingAttemptResult";

const pond = [
  { shop_item_id: "common-a", star_rarity: 1 },
  { shop_item_id: "common-b", star_rarity: 1 },
  { shop_item_id: "rare", star_rarity: 5 },
];

test("authoritative selection is deterministic under injected randomness and always stocked", () => {
  for (const value of [0, 0.2, 0.7, 0.999]) {
    const selected = selectAuthoritativeFish(pond, () => value);
    assert.ok(pond.includes(selected));
  }
  assert.throws(() => selectAuthoritativeFish([], () => 0), (error: unknown) => error instanceof FishingAttemptError && error.reason === "empty_pond");
});

test("bait rarity forcing preserves the configured direct probability behavior", () => {
  assert.equal(selectAuthoritativeFish(pond, () => 0, 100, 5).shop_item_id, "rare");
  const sequence = [0.75, 0];
  assert.notEqual(selectAuthoritativeFish(pond, () => sequence.shift() ?? 0, 50, 5).shop_item_id, "rare");
});

test("attempt constants preserve expiry, leaderboard points, and rarity weights in the focused boundary", () => {
  assert.equal(FISHING_ATTEMPT_TTL_MS, 120_000);
  assert.deepEqual(FISH_POINTS, { 1: 10, 2: 12, 3: 20, 4: 25, 5: 50 });
});

test("fresh and replayed catches retain the same authoritative caught outcome", () => {
  const fresh = normalizeFishingAttemptResult({ outcome: "caught", caught: { shopItemId: "fish-1" }, fishItemId: "fish-1" });
  const replay = { ...normalizeFishingAttemptResult(JSON.stringify(fresh)), replayed: true };
  assert.equal(fishingCompletionOutcome(fresh), "caught");
  assert.equal(fishingCompletionOutcome(replay), "caught");
  assert.equal(replay.caught?.shopItemId, "fish-1");
});

test("caught outcome does not depend on complete item metadata", () => {
  const response = { outcome: "caught" as const, caught: null, fishItemId: "fish-1", item: null };
  assert.equal(fishingCompletionOutcome(response), "caught");
  assert.equal(response.fishItemId, "fish-1");
});

test("committed miss and legacy durable results normalize without changing semantics", () => {
  assert.equal(fishingCompletionOutcome(normalizeFishingAttemptResult({ outcome: "miss", caught: null, reason: "miss" })), "miss");
  assert.equal(normalizeFishingAttemptResult({ caught: { shopItemId: "legacy-fish" } }).outcome, "caught");
  assert.equal(normalizeFishingAttemptResult({ caught: null, reason: "miss" }).outcome, "miss");
});

test("production protocol rejects old authority fields and atomically records all core writes", () => {
  const route = readFileSync("server/routes/fishing.routes.ts", "utf8");
  const service = readFileSync("server/fishingAttempt.ts", "utf8");
  const client = readFileSync("client/src/pages/FishingPage.tsx", "utf8");
  assert.doesNotMatch(client, /\/api\/fishing\/catch|performanceScore|selectedFishIdRef/);
  assert.doesNotMatch(route, /app\.post\("\/api\/fishing\/catch"/);
  assert.match(route, /keys\.some\(key => !\["locationId", "interactionScore"\]/);
  assert.match(service, /SELECT \*, expires_at <= NOW\(\) AS is_expired FROM fishing_attempts WHERE id = .* FOR UPDATE/);
  assert.match(service, /Math\.min\(99, Math\.floor\(input\.interactionScore\)\)/);
  for (const mutation of ["player_fish_inventory", "player_fish_catch_log", "total_fish_caught", "user_inventory", "fishing_leaderboard", "user_janson_quests", "result_json"]) {
    assert.match(service, new RegExp(mutation));
  }
  assert.match(service, /return db\.transaction/);
  assert.match(service, /outcome: "caught"/);
  assert.match(service, /outcome: "miss"/);
});

test("durable schema has ownership, expiry, hidden outcome, replay result, and lookup indexes", () => {
  const schema = readFileSync("shared/schema.ts", "utf8");
  const runtime = readFileSync("server/startup/backfills/runNonCriticalStartup.ts", "utf8");
  for (const field of ["userId", "locationId", "selectedFishId", "catchRoll", "status", "resultJson", "expiresAt", "completedAt"]) assert.match(schema, new RegExp(field));
  assert.match(runtime, /idx_fishing_attempt_owner_expiry/);
  assert.match(runtime, /idx_fishing_attempt_expiry/);
});
