import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerFishingAquariumRoutes, registerFishingRoutes } from "../server/routes/fishing.routes";

type Registration = { method: string; path: string; handlers: Function[] };

const expectedRoutes = [
  ["get", "/api/fish-parts/:fishItemId"],
  ["get", "/api/admin/fish-parts/:fishItemId"],
  ["post", "/api/admin/fish-parts/:fishItemId"],
  ["patch", "/api/admin/fish-parts/:partId"],
  ["delete", "/api/admin/fish-parts/:partId"],
  ["get", "/api/admin/location/:locationId/pond-fish"],
  ["post", "/api/admin/location/:locationId/pond-fish"],
  ["delete", "/api/admin/location/:locationId/pond-fish/:shopItemId"],
  ["get", "/api/fishing/all-fish"],
  ["get", "/api/fishing/fish-by-world"],
  ["get", "/api/fishing/caught-fish-ids"],
  ["post", "/api/fishing/claim-catch-reward"],
  ["get", "/api/location/:locationId/pond-fish"],
  ["get", "/api/fishing/equipment"],
  ["post", "/api/fishing/equip"],
  ["post", "/api/fishing/unequip"],
  ["get", "/api/fishing/inventory"],
  ["post", "/api/fishing/catch"],
  ["get", "/api/fishing/leaderboard/:worldId"],
  ["get", "/api/world/:worldId/fish-barrel"],
  ["patch", "/api/admin/fish-barrel/:id"],
  ["delete", "/api/admin/fish-barrel/:id"],
  ["post", "/api/fishing/aquarium/sync"],
  ["post", "/api/fishing/aquarium/add"],
  ["post", "/api/fishing/aquarium/remove"],
  ["get", "/api/aquarium/unlocks"],
  ["post", "/api/aquarium/unlock"],
  ["post", "/api/fishing/sell"],
] as const;

function setup(overrides: Record<string, unknown> = {}) {
  const registrations: Registration[] = [];
  const app: any = {};
  for (const method of ["get", "post", "patch", "delete"]) {
    app[method] = (path: string, ...handlers: Function[]) => registrations.push({ method, path, handlers });
  }
  const auth = () => undefined;
  const deps: any = {
    storage: {}, db: {}, isAuthenticated: auth,
    processFishPartImage: async (value: Buffer) => value,
    executeFishCatchRewardClaim: async () => "success",
    sellFish: async () => ({}), getFishSaleErrorReason: () => null,
    incrementQuestProgress: async () => undefined,
    maybeAwardFisherBadges: async () => undefined,
    maybeAwardFishBookBadge: async () => undefined,
    ...overrides,
  };
  registerFishingRoutes(app, deps);
  registerFishingAquariumRoutes(app, deps);
  return { registrations, auth };
}

function response() {
  return {
    statusCode: 200, body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
}

test("the extraction retains the complete ordered route inventory exactly once and behind auth", () => {
  const { registrations, auth } = setup();
  assert.deepEqual(registrations.map(({ method, path }) => [method, path]), expectedRoutes);
  assert.equal(new Set(registrations.map(r => `${r.method} ${r.path}`)).size, expectedRoutes.length);
  assert.ok(registrations.every(route => route.handlers[0] === auth));
  assert.ok(registrations.every(route => route.handlers.length === 2));
});

test("unauthenticated requests are rejected before moved handlers run", () => {
  let handlerRan = false;
  const rejectAnonymous = (_req: unknown, res: ReturnType<typeof response>) => res.status(401).json({ message: "Authentication required" });
  const { registrations } = setup({ isAuthenticated: rejectAnonymous });
  const res = response();
  registrations[0].handlers[0]({}, res, () => { handlerRan = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(handlerRan, false);
});

test("fishing admin handlers retain their authenticated manual administrator restriction", async () => {
  const { registrations } = setup({ storage: { getFishTemplateParts: async () => [] } });
  const admin = registrations.find(r => r.path === "/api/admin/fish-parts/:fishItemId")!;
  const res = response();
  await admin.handlers[1]({ user: { id: "player", isAdmin: false }, params: { fishItemId: "fish" } }, res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Forbidden" });
});

test("aquarium mutations scope storage access to the authenticated owner", async () => {
  const calls: unknown[][] = [];
  const { registrations } = setup({
    storage: { addFishToAquarium: async (...args: unknown[]) => { calls.push(args); return "owned-fish"; } },
  });
  const add = registrations.find(r => r.path === "/api/fishing/aquarium/add")!;
  const res = response();
  await add.handlers[1]({ user: { id: "session-owner" }, body: { shopItemId: "fish", slot: "bayou", ownerId: "attacker" } }, res);
  assert.deepEqual(calls, [["session-owner", "fish", "bayou"]]);
  assert.deepEqual(res.body, { ok: true, fishId: "owned-fish" });
});

test("secured helper boundaries and cross-domain market ownership remain explicit", () => {
  const moduleSource = readFileSync(new URL("../server/routes/fishing.routes.ts", import.meta.url), "utf8");
  const rootSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  assert.equal((moduleSource.match(/app\.post\("\/api\/fishing\/sell"/g) ?? []).length, 1);
  assert.match(moduleSource, /sellFish\(user\.id, fishIds\)/);
  assert.match(moduleSource, /db\.transaction/);
  assert.match(moduleSource, /pg_advisory_xact_lock/);
  assert.match(moduleSource, /executeFishCatchRewardClaim/);
  assert.match(moduleSource, /incrementQuestProgress\(user\.id, "catch_fish"\)/);
  assert.match(moduleSource, /maybeAwardFisherBadges/);
  assert.match(moduleSource, /maybeAwardFishBookBadge/);
  assert.doesNotMatch(moduleSource, /\/api\/market/);
  assert.match(rootSource, /app\.post\("\/api\/market\/list-fish"/);
  assert.doesNotMatch(rootSource + moduleSource, /\/api\/fishing\/inventory\/add/);
});
