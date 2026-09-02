import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { AccountConflictError } from "../server/accounts/errors";
import { publicAccount } from "../server/accounts/publicAccount";
import { updateUsernameSchema } from "../shared/schema";

// Exercise the actual legacy route handlers without starting the game/server.
function handler(method: "get" | "patch", path: string, dependencies: Record<string, unknown>) {
  const source = readFileSync("server/routes.ts", "utf8");
  const start = source.indexOf(`  app.${method}("${path}"`);
  assert.ok(start >= 0);
  const end = source.indexOf("\n  app.", start + 1);
  let route!: (req: any, res: any) => Promise<unknown>;
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(js, {
    app: { [method]: (_path: string, _auth: unknown, fn: typeof route) => { route = fn; } },
    isAuthenticated: () => {}, console: { error: () => {} },
    AccountConflictError, publicAccount, updateUsernameSchema,
    ...dependencies,
  });
  return async (request: any) => {
    const result = { status: 200, body: undefined as any };
    const response = { status(code: number) { result.status = code; return response; }, json(body: any) { result.body = body; return response; } };
    await route(request, response);
    return result;
  };
}

test("pending rewards stay available when welcome retry fails", async () => {
  let reads = 0;
  const pending = handler("get", "/api/rewards/pending", {
    grantWelcomeV2Bundle: async () => { throw new Error("invalid welcome configuration"); },
    storage: {
      getUnclaimedRewards: async () => { reads++; return [{ id: "existing-reward", bundleId: "bundle" }]; },
      getRewardBundle: async () => ({ id: "bundle", name: "Existing gift", coinAmount: 50 }),
      getRewardBundleItems: async () => [],
    },
    sql: () => ({}), db: { execute: async () => ({ rows: [] }) },
  });
  const result = await pending({ user: { id: "player", welcomeV2Sent: false } });
  assert.equal(reads, 1);
  assert.equal(result.status, 200);
  assert.equal(result.body[0].rewardId, "existing-reward");
  assert.equal(result.body[0].coinAmount, 50);
});

test("username collisions return a conflict for both precheck and concurrent writes", async () => {
  for (const preexisting of [true, false]) {
    const update = handler("patch", "/api/user/username", {
      containsBadWord: async () => false,
      storage: {
        getUserByUsernameCaseInsensitive: async () => preexisting ? { id: "other", username: "Alice" } : undefined,
        updateUsername: async () => { throw new AccountConflictError("username"); },
      },
    });
    const result = await update({ user: { id: "player" }, body: { username: "alice" } });
    assert.equal(result.status, 409);
    assert.equal(result.body.field, "username");
  }
});
