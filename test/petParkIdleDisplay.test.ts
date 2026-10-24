import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { petParkDeposits, users } from "../shared/schema";
import { registerPetParkDisplayRoutes } from "../server/routes/petParkDisplay.routes";

const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
const playerRoutes = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

function harness({ exists = true, throwOnWrite = false }: { exists?: boolean; throwOnWrite?: boolean } = {}) {
  const handlers: RequestHandler[] = [];
  const app = { patch: (_path: string, ...actions: RequestHandler[]) => { handlers.push(...actions); } };
  const deposit = {
    id: "deposit-1", userId: "owner-1", petInventoryId: "pet-1",
    showInPark: true, parkXPct: null as number | null, parkYPct: null as number | null,
    buildingId: "building-1" as string | null, pose: "sleep",
    checkpointAt: new Date("2026-01-01T00:00:00Z"),
    pausedAt: null, pausedDurationMs: 0, withdrawnAt: null,
  };
  const calls = { locked: [] as unknown[], writes: [] as Record<string, unknown>[], transactions: 0 };
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          for: async (mode: string) => {
            assert.equal(mode, "update");
            calls.locked.push(table);
            if (table === users) return [{ id: "owner-1" }];
            if (table === petParkDeposits) return exists ? [deposit] : [];
            throw Error("Unexpected read");
          },
        }),
      }),
    }),
    update: (table: unknown) => {
      assert.equal(table, petParkDeposits);
      return { set: (patch: Record<string, unknown>) => ({
        where: () => ({ returning: async () => {
          if (throwOnWrite) throw new Error("DB failure");
          calls.writes.push(patch);
          Object.assign(deposit, patch);
          return [{ ...deposit }];
        } }),
      }) };
    },
  };
  const db = { transaction: async (callback: (transaction: any) => Promise<any>) => {
    calls.transactions++;
    return callback(tx);
  } };
  registerPetParkDisplayRoutes(app as any, ((_req: any, _res: any, next: any) => next()) as any, db as any);
  const route = handlers.at(-1)!;
  return {
    calls, deposit,
    invoke: async (body: Record<string, unknown>, owner = "owner-1") => {
      const response: any = {
        statusCode: 200, body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(value: unknown) { this.body = value; return this; },
      };
      await route({ params: { id: "deposit-1" }, body, user: { id: owner } } as any, response, (() => {}) as any);
      return response;
    },
  };
}

test("returning to idle preserves deposit, owner and reward checkpoints", async () => {
  const { deposit, calls, invoke } = harness();
  const before = deposit.checkpointAt;
  const result = await invoke({ display: "idle" });
  assert.equal(result.statusCode, 200);
  assert.equal(deposit.showInPark, false);
  assert.equal(deposit.buildingId, null);
  assert.equal(deposit.pose, "idle");
  assert.equal(deposit.checkpointAt, before);
  assert.equal(deposit.withdrawnAt, null);
  assert.equal(calls.transactions, 1);
  assert.deepEqual(calls.locked, [users, petParkDeposits]);
  assert.deepEqual(Object.keys(calls.writes[0]).sort(), ["buildingId", "pose", "showInPark"].sort());
});

test("showing a deposited pet in park sets optional normalized world position without a claim", async () => {
  const { deposit, calls, invoke } = harness();
  const first = await invoke({ display: "idle" });
  assert.equal(first.statusCode, 200);
  const result = await invoke({ display: "park", xPct: 0.27, yPct: 0.74 });
  assert.equal(result.statusCode, 200);
  assert.equal(deposit.showInPark, true);
  assert.equal(deposit.parkXPct, 0.27);
  assert.equal(deposit.parkYPct, 0.74);
  assert.equal(deposit.checkpointAt.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(deposit.buildingId, null);
  assert.equal(calls.writes.length, 2);
  assert.deepEqual(Object.keys(calls.writes[1]).sort(), ["buildingId", "parkXPct", "parkYPct", "pose", "showInPark"].sort());
});

test("invalid visibility or partial coordinates fail before transaction and persistence", async () => {
  const { invoke, calls } = harness();
  for (const body of [
    { display: "hidden" }, { display: "park", xPct: 0.5 },
    { display: "park", xPct: -1, yPct: 0.2 },
    { display: "park", xPct: 0.2, yPct: 1.1 },
    { display: "park", xPct: "0.5", yPct: 0.5 },
    { display: "idle", xPct: 0.5, yPct: 0.5 },
  ]) {
    const result = await invoke(body);
    assert.equal(result.statusCode, 400);
  }
  assert.equal(calls.transactions, 0);
  assert.equal(calls.writes.length, 0);
});

test("missing/nonowned/withdrawn deposits cannot change visibility", async () => {
  const { invoke, calls } = harness({ exists: false });
  assert.equal((await invoke({ display: "idle" })).statusCode, 404);
  assert.equal(calls.writes.length, 0);
});

test("database write failures do not claim or withdraw pets", async () => {
  const { invoke, calls } = harness({ throwOnWrite: true });
  assert.equal((await invoke({ display: "idle" })).statusCode, 500);
  assert.equal(calls.writes.length, 0);
});

test("legacy deposits stay public while newly deposited pets default idle", () => {
  assert.match(migration, /show_in_park boolean NOT NULL DEFAULT true/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS show_in_park boolean NOT NULL DEFAULT true/);
  assert.match(migration, /park_x_pct real CHECK/);
  assert.match(playerRoutes, /petInventoryId, slotNumber, showInPark: false/);
  assert.match(playerRoutes, /eq\(petParkDeposits\.showInPark, true\)/);
  assert.match(playerRoutes, /showInPark: petParkDeposits\.showInPark/);
  assert.match(playerRoutes, /showInPark: true/); // Existing interior placement still exposes pet.
  assert.match(playerRoutes, /settleDeposit\(userId: string, depositId: string, withdraw: boolean\)/);
  const settlement = playerRoutes.split("async function settleDeposit")[1];
  assert.doesNotMatch(settlement, /showInPark|parkXPct|parkYPct/);
});

test("current on-screen slot UI can place or return a pet without withdrawing it", () => {
  assert.match(page, /Return to idle/);
  assert.match(page, /Show in park/);
  assert.match(page, /Idle — earning/);
  assert.match(page, /\$\{pet\.id\}\/display/);
  assert.match(page, /pet\.parkXPct != null && pet\.parkYPct != null/);
  assert.match(page, /scene\.canEditPark && deposits\.length === 0 \? null : <div/);
  assert.match(page, /if \(scene\.canEditPark && !pet\) return null/);
});
