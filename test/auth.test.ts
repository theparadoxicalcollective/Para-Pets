import assert from "node:assert/strict";
import test from "node:test";
import { requireAdmin, requireAuthenticated } from "../server/auth";
import { storage } from "../server/storage";

function response() {
  const result = { statusCode: 200, body: undefined as unknown };
  return {
    result,
    status(code: number) { result.statusCode = code; return this; },
    json(body: unknown) { result.body = body; return this; },
  };
}

function request(user?: Record<string, unknown>) {
  return {
    user,
    isAuthenticated: () => Boolean(user),
    logout: (callback: () => void) => callback(),
  };
}

test("authentication middleware rejects anonymous requests and admits active players", async () => {
  const anonymousResponse = response();
  await requireAuthenticated(request() as any, anonymousResponse as any, (() => assert.fail("next must not run")) as any);
  assert.deepEqual(anonymousResponse.result, { statusCode: 401, body: { message: "Unauthorized" } });

  let nextCalls = 0;
  await requireAuthenticated(request({ id: "player", isBanned: false }) as any, response() as any, (() => { nextCalls++; }) as any);
  assert.equal(nextCalls, 1);
});

test("verified-admin middleware requires a current verified administrator", async () => {
  const originalGetUser = storage.getUser;
  try {
    (storage as any).getUser = async () => ({ id: "admin", isAdmin: true, emailVerified: false, isBanned: false });
    const denied = response();
    await requireAdmin(request({ id: "admin" }) as any, denied as any, (() => assert.fail("next must not run")) as any);
    assert.deepEqual(denied.result, { statusCode: 403, body: { message: "Verified administrator access required" } });

    const currentAdmin = { id: "admin", isAdmin: true, emailVerified: true, isBanned: false };
    (storage as any).getUser = async () => currentAdmin;
    const req = request({ id: "admin" });
    let nextCalls = 0;
    await requireAdmin(req as any, response() as any, (() => { nextCalls++; }) as any);
    assert.equal(nextCalls, 1);
    assert.equal(req.user, currentAdmin);
  } finally {
    (storage as any).getUser = originalGetUser;
  }
});
