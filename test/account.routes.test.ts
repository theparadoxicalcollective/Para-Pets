import assert from "node:assert/strict";
import test from "node:test";
import { registerAccountRoutes } from "../server/routes/account.routes";

type Handler = (req: any, res: any, next?: () => void) => unknown;

function harness() {
  const routes = new Map<string, Handler[]>();
  const app = {
    get(path: string, ...handlers: Handler[]) { routes.set(`GET ${path}`, handlers); },
    post(path: string, ...handlers: Handler[]) { routes.set(`POST ${path}`, handlers); },
  };
  const storage: any = {
    getUserByUsernameCaseInsensitive: async () => undefined,
    getUserByEmail: async () => undefined,
    createUser: async (user: any) => ({ id: "new-user", ...user }),
    addCoins: async () => undefined,
    setWelcomeV2Sent: async () => undefined,
    grantUserHouseBundle: async () => undefined,
    setActiveHouseBundle: async () => undefined,
    setEmailVerificationToken: async () => undefined,
    getUserByResetToken: async () => undefined,
    clearPasswordResetToken: async () => undefined,
    updatePassword: async () => undefined,
    getUserByEmailVerificationToken: async () => undefined,
    verifyEmail: async () => undefined,
    getUser: async () => undefined,
    setPasswordResetToken: async () => undefined,
  };
  const auth: Handler = (req, res, next) => req.user ? next?.() : res.status(401).json({ message: "Unauthorized" });
  registerAccountRoutes(app as any, {
    storage,
    isAuthenticated: auth as any,
    containsBadWord: async () => false,
    findRecentlyDeletedAccounts: async () => [],
    getFreeHouseBundles: async () => [],
    updateSignupReferrer: async () => undefined,
    grantWelcomeV2Bundle: async () => undefined,
    postWatcherMessage: async () => undefined,
    emailClient: { send: async () => ({}) },
  });
  return { routes, storage };
}

function response() {
  const result: any = { statusCode: 200, body: undefined, redirect: undefined };
  const res: any = {
    status(code: number) { result.statusCode = code; return res; },
    json(body: unknown) { result.body = body; return res; },
    redirect(location: string) { result.redirect = location; return res; },
  };
  return { result, res };
}

async function invoke(handlers: Handler[], req: any, res: any) {
  if (handlers.length === 2) await handlers[0](req, res, () => handlers[1](req, res));
  else await handlers[0](req, res);
}

test("account module registers the exact extracted API paths and preserves resend authentication", () => {
  const { routes } = harness();
  assert.deepEqual([...routes.keys()], [
    "POST /api/auth/register",
    "POST /api/auth/logout",
    "GET /api/auth/reset-password/:token",
    "POST /api/auth/reset-password",
    "POST /api/auth/forgot-password",
    "GET /api/auth/verify-email/:token",
    "POST /api/auth/resend-verification",
  ]);
  assert.equal(routes.get("POST /api/auth/resend-verification")!.length, 2);
  assert.equal(routes.get("POST /api/auth/register")!.length, 1);
});

test("registration retains least-privilege defaults and duplicate username/email responses", async () => {
  const { routes, storage } = harness();
  const register = routes.get("POST /api/auth/register")!;
  let created: any;
  storage.createUser = async (user: any) => { created = user; return { id: "new-user", ...user }; };
  const ok = response();
  await invoke(register, { body: { username: "new_user", email: "new@example.com", password: "secret" }, login: (_user: any, cb: any) => cb() }, ok.res);
  assert.equal(ok.result.statusCode, 201);
  assert.equal(created.isAdmin, false);
  assert.equal(created.isModerator, false);

  storage.getUserByUsernameCaseInsensitive = async () => ({ id: "existing" });
  const duplicateUsername = response();
  await invoke(register, { body: { username: "new_user", email: "new@example.com", password: "secret" } }, duplicateUsername.res);
  assert.deepEqual(duplicateUsername.result, { statusCode: 400, body: { field: "username", message: "That username is already taken. Please choose another." }, redirect: undefined });

  storage.getUserByUsernameCaseInsensitive = async () => undefined;
  storage.getUserByEmail = async () => ({ id: "existing" });
  const duplicateEmail = response();
  await invoke(register, { body: { username: "new_user", email: "new@example.com", password: "secret" } }, duplicateEmail.res);
  assert.deepEqual(duplicateEmail.result, { statusCode: 400, body: { field: "email", message: "That email is already registered. Try logging in instead." }, redirect: undefined });
});

test("reset expiry and verification token responses remain unchanged", async () => {
  const { routes, storage } = harness();
  const expired = new Date(Date.now() - 1_000);
  storage.getUserByResetToken = async () => ({ id: "player", passwordResetExpires: expired });
  let cleared = false;
  storage.clearPasswordResetToken = async () => { cleared = true; };
  const reset = response();
  await invoke(routes.get("GET /api/auth/reset-password/:token")!, { params: { token: "expired" } }, reset.res);
  assert.deepEqual(reset.result, { statusCode: 400, body: { valid: false, message: "Reset link has expired" }, redirect: undefined });
  assert.equal(cleared, true);

  storage.getUserByEmailVerificationToken = async () => undefined;
  const invalid = response();
  await invoke(routes.get("GET /api/auth/verify-email/:token")!, { params: { token: "bad" } }, invalid.res);
  assert.equal(invalid.result.redirect, "https://parapets.net/?verified=invalid");
});

test("resend verification rejects anonymous users and logout retains Passport callback behavior", async () => {
  const { routes } = harness();
  const unauthorized = response();
  await invoke(routes.get("POST /api/auth/resend-verification")!, {}, unauthorized.res);
  assert.deepEqual(unauthorized.result, { statusCode: 401, body: { message: "Unauthorized" }, redirect: undefined });

  const authenticated = response();
  await invoke(routes.get("POST /api/auth/resend-verification")!, { user: { id: "player" } }, authenticated.res);
  assert.deepEqual(authenticated.result, { statusCode: 404, body: { message: "User not found" }, redirect: undefined });

  let loggedOut = false;
  const logout = response();
  await invoke(routes.get("POST /api/auth/logout")!, { logout: (callback: any) => { loggedOut = true; callback(); } }, logout.res);
  assert.equal(loggedOut, true);
  assert.deepEqual(logout.result, { statusCode: 200, body: { message: "Logged out" }, redirect: undefined });
});
