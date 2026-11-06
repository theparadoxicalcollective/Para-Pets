import assert from "node:assert/strict";
import test from "node:test";
import type { Express, RequestHandler } from "express";
import {
  PET_TEAM_LIMIT,
  PetTeamSelectionError,
  parsePetTeamSelection,
  resolvePetTeam,
  type PetTeamRecord,
} from "../server/petTeam";
import { registerPlayerPetTeamRoutes } from "../server/routes/playerPetTeam.routes";
import { registerPvpRoutes } from "../server/routes/pvp.routes";

const pet = (overrides: Partial<PetTeamRecord> = {}): PetTeamRecord => ({
  id: "pet-a",
  userId: "keeper-1",
  type: "pet",
  isHatched: true,
  isListed: false,
  petAtk: 70,
  petDef: 40,
  petLevel: 8,
  ...overrides,
});

test("five-pet selection accepts ordered sets and deliberate empty teams", () => {
  assert.equal(PET_TEAM_LIMIT, 5);
  assert.deepEqual(parsePetTeamSelection([]), []);
  assert.deepEqual(parsePetTeamSelection(["a", "b", "c", "d", "e"]), ["a", "b", "c", "d", "e"]);
});

test("selection rejects malformed, duplicate and oversized payloads instead of truncating", () => {
  for (const invalid of [undefined, null, {}, "pet-a", [null], [1], [""], [" a "], ["a", "a"], ["a", "b", "c", "d", "e", "f"]]) {
    assert.throws(() => parsePetTeamSelection(invalid), PetTeamSelectionError);
  }
});

test("read-time normalization preserves order, removes stale or ineligible IDs and derives live power", () => {
  const records = [
    pet({ id: "a", petAtk: 100, petDef: 50, petLevel: 6 }),
    pet({ id: "b", userId: "keeper-2" }),
    pet({ id: "c", isHatched: false }),
    pet({ id: "d", isListed: true }),
    pet({ id: "e", type: "costume" }),
    pet({ id: "f", petAtk: 20, petDef: 10, petLevel: 2 }),
  ];
  const result = resolvePetTeam(["f", "x", "b", "a", "c", "d", "e", "f"], "keeper-1", records);
  // Existing legacy duplicates/ghost IDs must not become another usable slot.
  assert.deepEqual(result.petInventoryIds, ["f", "a"]);
  assert.equal(result.attackPower, (20 + 5 + 10) + (100 + 25 + 30));
  assert.deepEqual(resolvePetTeam([], "keeper-1", records), { petInventoryIds: [], attackPower: 0 });
});

test("power values use existing PvP defaults, and newly leveled pet records immediately affect reads", () => {
  const base = pet({ id: "a", petAtk: null, petDef: null, petLevel: null });
  assert.equal(resolvePetTeam(["a"], "keeper-1", [base]).attackPower, 80);
  assert.equal(resolvePetTeam(["a"], "keeper-1", [pet({ id: "a", petLevel: 9 })]).attackPower, 135);
  assert.deepEqual(resolvePetTeam(["a"], "keeper-2", [base]).petInventoryIds, []);
});

type RegisteredRoute = { method: "GET" | "PUT" | "POST"; path: string; handlers: RequestHandler[] };
function routeHarness() {
  const routes: RegisteredRoute[] = [];
  const app = {
    get(path: string, ...handlers: RequestHandler[]) { routes.push({ method: "GET", path, handlers }); },
    put(path: string, ...handlers: RequestHandler[]) { routes.push({ method: "PUT", path, handlers }); },
    post(path: string, ...handlers: RequestHandler[]) { routes.push({ method: "POST", path, handlers }); },
  } as unknown as Express;
  const auth = ((_req: unknown, _res: unknown, next: () => void) => next()) as RequestHandler;
  async function invoke(method: RegisteredRoute["method"], path: string, body?: unknown) {
    const route = routes.find((r) => r.method === method && r.path === path);
    assert.ok(route, method + " " + path + " registered");
    assert.equal(route.handlers[0], auth, "route requires auth middleware");
    let status = 200;
    let response: unknown;
    const res = {
      status(code: number) { status = code; return this; },
      json(payload: unknown) { response = payload; return this; },
    };
    await route.handlers.at(-1)!({ user: { id: "keeper-1" }, body } as any, res as any, () => {});
    return { status, response };
  }
  return { app, auth, invoke };
}

test("player team read/write APIs use the same existing storage contract", async () => {
  const harness = routeHarness();
  const writes: unknown[] = [];
  const storage = {
    getBattleGroup: async () => ({ petInventoryIds: ["pet-a"], attackPower: 130 }),
    upsertBattleGroup: async (userId: string, ids: unknown) => {
      writes.push({ userId, ids });
      return { petInventoryIds: ids, attackPower: 130 };
    },
  };
  registerPlayerPetTeamRoutes(harness.app, { storage: storage as any, isAuthenticated: harness.auth });
  assert.deepEqual((await harness.invoke("GET", "/api/player/pet-team")).response, {
    petInventoryIds: ["pet-a"], attackPower: 130,
  });
  const saved = await harness.invoke("PUT", "/api/player/pet-team", { petInventoryIds: ["pet-a"] });
  assert.equal(saved.status, 200);
  assert.deepEqual(writes, [{ userId: "keeper-1", ids: ["pet-a"] }]);
});

test("invalid team writes map to a usable 422 rather than a server error", async () => {
  const harness = routeHarness();
  registerPlayerPetTeamRoutes(harness.app, {
    storage: {
      getBattleGroup: async () => null,
      upsertBattleGroup: async () => { throw new PetTeamSelectionError("Invalid companion", 422); },
    } as any,
    isAuthenticated: harness.auth,
  });
  assert.deepEqual((await harness.invoke("GET", "/api/player/pet-team")).response, {
    petInventoryIds: [], attackPower: 0,
  });
  const result = await harness.invoke("PUT", "/api/player/pet-team", { petInventoryIds: ["missing"] });
  assert.equal(result.status, 422);
  assert.deepEqual(result.response, { message: "Invalid companion" });
});

test("legacy PvP POST remains an authenticated alias, including validation failures", async () => {
  const harness = routeHarness();
  const calls: unknown[] = [];
  const storage = {
    upsertBattleGroup: async (userId: string, ids: unknown) => {
      calls.push([userId, ids]);
      if (!Array.isArray(ids)) throw new PetTeamSelectionError("petInventoryIds must be an array");
      return { petInventoryIds: ids, attackPower: 0 };
    },
  };
  registerPvpRoutes(harness.app, {
    storage: storage as any,
    isAuthenticated: harness.auth,
    publicAccount: (value: any) => value,
    maybeAwardBrawlerBadges: async () => {},
  });
  const ok = await harness.invoke("POST", "/api/pvp/battle-group", { petInventoryIds: ["pet-a"] });
  assert.equal(ok.status, 200);
  assert.deepEqual(calls[0], ["keeper-1", ["pet-a"]]);
  const bad = await harness.invoke("POST", "/api/pvp/battle-group", {});
  assert.equal(bad.status, 400);
});
