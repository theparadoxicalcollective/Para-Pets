import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STARTUP_ORDER, NONCRITICAL_BOUNDARIES } from "../server/startup/startupContract";
import { STARTUP_ADVISORY_LOCK_KEY, withStartupAdvisoryLock } from "../server/startup/advisoryLock";

test("startup contract preserves readiness and background ordering", () => {
  assert.deepEqual(STARTUP_ORDER, [
    "essential-schema", "route-registration", "error-middleware",
    "static-or-vite", "http-listen", "noncritical-locked-background",
  ]);
  assert.deepEqual(NONCRITICAL_BOUNDARIES, ["migrations", "backfills", "seeds", "assetSync"]);
});

test("critical schema responsibilities remain in essential boot", () => {
  const source = readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");
  for (const responsibility of [
    'CREATE TABLE IF NOT EXISTS "session"',
    "CREATE TABLE IF NOT EXISTS media_blobs",
    "watcher_shoutouts_enabled",
    "is_bot",
    "pvp_battle_groups ADD COLUMN IF NOT EXISTS attack_power",
    "molten_blocks_high_score",
    "raid_total_damage",
    "CREATE TABLE IF NOT EXISTS molten_blocks_drop_items",
  ]) assert.match(source, new RegExp(responsibility.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("advisory lock is nonblocking and releases after success", async () => {
  const queries: Array<[string, unknown[] | undefined]> = [];
  let released = false;
  const client = {
    query: async (text: string, params?: unknown[]) => {
      queries.push([text, params]);
      return { rows: [{ acquired: true }] };
    },
    release: () => { released = true; },
  };
  let worked = false;
  const ran = await withStartupAdvisoryLock({ connect: async () => client } as any, async () => { worked = true; });
  assert.equal(ran, true);
  assert.equal(worked, true);
  assert.equal(released, true);
  assert.match(queries[0][0], /pg_try_advisory_lock/);
  assert.deepEqual(queries[0][1], [STARTUP_ADVISORY_LOCK_KEY]);
  assert.match(queries[1][0], /pg_advisory_unlock/);
});

test("advisory lock skips work instead of waiting when held elsewhere", async () => {
  let worked = false;
  let released = false;
  const client = {
    query: async () => ({ rows: [{ acquired: false }] }),
    release: () => { released = true; },
  };
  const ran = await withStartupAdvisoryLock({ connect: async () => client } as any, async () => { worked = true; });
  assert.equal(ran, false);
  assert.equal(worked, false);
  assert.equal(released, true);
});
