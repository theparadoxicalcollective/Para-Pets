import assert from "node:assert/strict";
import test from "node:test";
import { createAuthMiddleware } from "../server/auth";

function response() {
  let statusCode = 200;
  let body: unknown;
  return {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
    result: () => ({ statusCode, body }),
  };
}

test("authenticated routes reject requests without a session", async () => {
  const { requireAuthenticated } = createAuthMiddleware({
    getUser: async () => undefined,
    unbanUser: async () => { throw new Error("must not unban"); },
  } as any);
  const res = response();
  let nextCalled = false;

  await requireAuthenticated({ isAuthenticated: () => false } as any, res as any, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.deepEqual(res.result(), { statusCode: 401, body: { message: "Unauthorized" } });
});

test("expired bans are cleared before allowing an authenticated request", async () => {
  const unbanned: string[] = [];
  const { requireAuthenticated } = createAuthMiddleware({
    getUser: async () => undefined,
    unbanUser: async (id: string) => { unbanned.push(id); },
  } as any);
  const req = {
    isAuthenticated: () => true,
    user: { id: "player-1", isBanned: true, banUntil: new Date(Date.now() - 1_000) },
  } as any;
  const res = response();
  let nextCalled = false;

  await requireAuthenticated(req, res as any, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.user.isBanned, false);
  assert.deepEqual(unbanned, ["player-1"]);
});

test("admin routes require a verified current administrator", async () => {
  const { requireAdmin } = createAuthMiddleware({
    getUser: async () => ({ id: "admin-1", isAdmin: true, emailVerified: false, isBanned: false }),
    unbanUser: async () => { throw new Error("must not unban"); },
  } as any);
  const res = response();
  let nextCalled = false;

  await requireAdmin({ isAuthenticated: () => true, user: { id: "admin-1" } } as any, res as any, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.deepEqual(res.result(), { statusCode: 403, body: { message: "Verified administrator access required" } });
});

test("verified administrators are allowed and their current account replaces the session copy", async () => {
  const currentUser = { id: "admin-1", isAdmin: true, emailVerified: true, isBanned: false };
  const { requireAdmin } = createAuthMiddleware({
    getUser: async () => currentUser,
    unbanUser: async () => { throw new Error("must not unban"); },
  } as any);
  const req = { isAuthenticated: () => true, user: { id: "admin-1", isAdmin: false } } as any;
  const res = response();
  let nextCalled = false;

  await requireAdmin(req, res as any, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.user, currentUser);
});
