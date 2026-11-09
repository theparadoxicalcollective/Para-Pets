import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Express, RequestHandler } from "express";
import {
  INITIAL_PLAYER_PROGRESSION,
  MAX_PLAYER_TOTAL_XP,
  playerProgressionResponse,
  PLAYER_XP_REWARDS,
  levelForPlayerTotalXp,
  totalXpRequiredForPlayerLevel,
  type PlayerProgression,
} from "../shared/playerProgression";
import {
  executePlayerXpAward,
  PlayerXpAwardError,
  PlayerXpReceiptConflictError,
  type PlayerXpAward,
  type PlayerXpAwardOperations,
  type PlayerXpReceipt,
} from "../server/playerXpAward";
import { registerPlayerProgressionRoutes } from "../server/routes/playerProgression.routes";

const read = (path: string) => readFileSync(path, "utf8");

function awardHarness(initial: PlayerProgression = { level: 1, totalXp: 0 }) {
  let progress = { ...initial };
  const receipts = new Map<string, PlayerXpReceipt>();
  let saves = 0;
  const key = (source: string, eventId: string) => `${source}:${eventId}`;
  const operations: PlayerXpAwardOperations = {
    loadLockedProgress: async () => ({ ...progress }),
    findReceipt: async (source, eventId) => receipts.get(key(source, eventId)) ?? null,
    recordReceipt: async (award, after) => {
      const k = key(award.source, award.eventId);
      if (receipts.has(k)) return false;
      receipts.set(k, { amount: award.amount, totalXpAfter: after.totalXp, levelAfter: after.level });
      return true;
    },
    saveProgress: async (after) => { progress = { ...after }; saves += 1; },
  };
  return {
    operations,
    get progress() { return progress; },
    get saves() { return saves; },
    get receipts() { return receipts; },
  };
}

const sample = (overrides: Partial<PlayerXpAward> = {}): PlayerXpAward => ({
  source: "clearing_reward", eventId: "kill-123", amount: 20, ...overrides,
});

test("existing players read as Level 1 / 0 account XP without generating records or changing pet levels", () => {
  assert.deepEqual(INITIAL_PLAYER_PROGRESSION, { level: 1, totalXp: 0, stars: 0, cycleStartXp: 0 });
  assert.deepEqual(playerProgressionResponse(null), {
    level: 1, totalXp: 0, cycleXp: 0, stars: 0, canElevate: false, nextLevelTotalXp: 100, xpToNextLevel: 100,
  });
  assert.deepEqual(playerProgressionResponse({ level: 9, totalXp: 410 }), {
    level: 3, totalXp: 410, cycleXp: 410, stars: 0, canElevate: false, nextLevelTotalXp: 420, xpToNextLevel: 10,
  });
  assert.equal("petLevel" in playerProgressionResponse(null), false);
  assert.equal("activePetId" in playerProgressionResponse(null), false);
});

test("quest-first XP rewards and cumulative level thresholds scale independently of pets", () => {
  assert.equal(PLAYER_XP_REWARDS.storyQuest, 120);
  assert.ok(PLAYER_XP_REWARDS.storyQuest > PLAYER_XP_REWARDS.dailyQuest);
  assert.ok(PLAYER_XP_REWARDS.dailyQuest > PLAYER_XP_REWARDS.clearingVictory);
  assert.ok(PLAYER_XP_REWARDS.pvpWin < PLAYER_XP_REWARDS.newBadge);
  assert.equal(totalXpRequiredForPlayerLevel(1), 0);
  assert.equal(totalXpRequiredForPlayerLevel(2), 100);
  assert.equal(totalXpRequiredForPlayerLevel(3), 240);
  assert.equal(levelForPlayerTotalXp(239), 2);
  assert.equal(levelForPlayerTotalXp(240), 3);
  assert.equal(levelForPlayerTotalXp(2_147_483_647), 100);
  assert.deepEqual(playerProgressionResponse({ level: 100, totalXp: 1_000_000 }), {
    level: 100, totalXp: 1_000_000, cycleXp: 1_000_000, stars: 0, canElevate: true, nextLevelTotalXp: null, xpToNextLevel: null,
  });
});

test("one approved event is awarded exactly once and a duplicate returns the original receipt", async () => {
  const ctx = awardHarness();
  const policy = (total: number) => Math.floor(total / 100) + 1;
  assert.deepEqual(await executePlayerXpAward(sample(), ctx.operations, policy), {
    status: "applied", progress: { level: 1, totalXp: 20 },
  });
  const first = await executePlayerXpAward(sample({ eventId: "kill-124", amount: 120 }), ctx.operations, policy);
  assert.deepEqual(first, { status: "applied", progress: { level: 2, totalXp: 140 } });
  const retry = await executePlayerXpAward(sample(), ctx.operations, policy);
  assert.deepEqual(retry, { status: "duplicate", progress: { level: 1, totalXp: 20 } });
  assert.deepEqual(ctx.progress, { level: 2, totalXp: 140 });
  assert.equal(ctx.saves, 2);
});

test("receipt keys are distinct across sources and event IDs; reused IDs cannot change their award amount", async () => {
  const ctx = awardHarness();
  const fixed = (_total: number) => 1;
  await executePlayerXpAward(sample({ source: "daily_claim", eventId: "same" }), ctx.operations, fixed);
  await executePlayerXpAward(sample({ source: "quest_reward", eventId: "same" }), ctx.operations, fixed);
  assert.equal(ctx.progress.totalXp, 40);
  await assert.rejects(
    executePlayerXpAward(sample({ source: "daily_claim", eventId: "same", amount: 21 }), ctx.operations, fixed),
    PlayerXpReceiptConflictError,
  );
  assert.equal(ctx.progress.totalXp, 40);
});

test("duplicate insert race is reconciled via authoritative receipt instead of granting XP twice", async () => {
  const ctx = awardHarness();
  const receipt: PlayerXpReceipt = { amount: 20, totalXpAfter: 20, levelAfter: 1 };
  // Model ON CONFLICT DO NOTHING after an earlier transaction claimed the key.
  const operations: PlayerXpAwardOperations = {
    ...ctx.operations,
    recordReceipt: async () => false,
    findReceipt: async () => receipt,
  };
  const result = await executePlayerXpAward(sample(), operations, () => 1);
  assert.equal(result.status, "duplicate");
  assert.equal(ctx.saves, 0);
});

test("invalid awards and unsafe level policies cannot alter an account", async () => {
  const ctx = awardHarness();
  for (const invalid of [
    sample({ source: "" }), sample({ source: "unknown-source!" }),
    sample({ eventId: "" }), sample({ eventId: " leading-space" }),
    sample({ amount: 0 }), sample({ amount: -1 }), sample({ amount: 1.5 }),
    sample({ amount: Number.NaN }), sample({ amount: 1_000_001 }),
  ]) {
    await assert.rejects(executePlayerXpAward(invalid, ctx.operations, () => 1), PlayerXpAwardError);
  }
  await assert.rejects(executePlayerXpAward(sample(), ctx.operations, () => 0), PlayerXpAwardError);
  await assert.rejects(executePlayerXpAward(sample(), ctx.operations, () => 1.4), PlayerXpAwardError);
  assert.equal(ctx.saves, 0);
});

test("award overflow and backwards level policy are rejected before receipts are recorded", async () => {
  const high = awardHarness({ level: 7, totalXp: MAX_PLAYER_TOTAL_XP - 3 });
  await assert.rejects(executePlayerXpAward(sample(), high.operations, () => 8), PlayerXpAwardError);
  assert.equal(high.receipts.size, 0);
  const level = awardHarness({ level: 7, totalXp: 1000 });
  await assert.rejects(executePlayerXpAward(sample(), level.operations, () => 3), PlayerXpAwardError);
  assert.equal(level.saves, 0);
});

test("GET /api/player/progression requires auth, uses session user, and exposes no XP write route", async () => {
  const routes: { method: string; path: string; handlers: RequestHandler[] }[] = [];
  const app = {
    get: (path: string, ...handlers: RequestHandler[]) => { routes.push({ method: "GET", path, handlers }); },
    post: (path: string, ...handlers: RequestHandler[]) => { routes.push({ method: "POST", path, handlers }); },
    put: (path: string, ...handlers: RequestHandler[]) => { routes.push({ method: "PUT", path, handlers }); },
  } as unknown as Express;
  const auth = ((_req: unknown, _res: unknown, next: () => void) => next()) as RequestHandler;
  let requestedUserId: string | undefined;
  registerPlayerProgressionRoutes(app, {
    isAuthenticated: auth,
    readProgression: async (userId) => {
      requestedUserId = userId;
      return { level: 2, totalXp: 100 };
    },
  });
  assert.deepEqual(routes.map(r => [r.method, r.path]), [["GET", "/api/player/progression"]]);
  const route = routes[0];
  assert.equal(route.handlers[0], auth);
  const headers = new Map<string, string>();
  let body: unknown;
  const response = {
    setHeader: (key: string, value: string) => { headers.set(key, value); },
    json: (value: unknown) => { body = value; return response; },
    status: (_: number) => response,
  };
  await route.handlers.at(-1)!({ user: { id: "account-a" }, query: { userId: "account-b" } } as any, response as any, () => {});
  assert.equal(requestedUserId, "account-a");
  assert.equal(headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(body, { level: 2, totalXp: 100, cycleXp: 100, stars: 0, canElevate: false, nextLevelTotalXp: 240, xpToNextLevel: 140 });
});

test("boot migration and database service enforce owner-specific unique receipts and an atomic row lock", () => {
  const migration = read("server/startup/migrations/ensurePlayerProgressionStorage.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const service = read("server/playerProgressionStorage.ts");
  const routes = read("server/routes.ts");
  const schema = read("shared/schema.ts");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS player_progression/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS player_xp_receipts/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS player_xp_receipts_owner_source_event_uidx/);
  assert.match(migration, /ON DELETE CASCADE/);
  assert.match(boot, /await ensurePlayerProgressionStorage\(\)/);
  assert.match(service, /db\.transaction\(async \(tx\)/);
  assert.match(service, /\.for\("update"\)/);
  assert.match(service, /onConflictDoNothing\(\{/);
  assert.match(service, /target: \[playerXpReceipts\.userId, playerXpReceipts\.source, playerXpReceipts\.eventId\]/);
  assert.match(schema, /export const playerProgression = pgTable/);
  assert.match(routes, /registerPlayerProgressionRoutes\(app, \{ isAuthenticated, readProgression: getPlayerProgression \}\)/);
  assert.doesNotMatch(read("server/routes/playerProgression.routes.ts"), /app\.(post|patch|put|delete)\(/);
  assert.doesNotMatch(read("client/src/pages/HomePage.tsx"), /\/api\/player\/progression/);
});
