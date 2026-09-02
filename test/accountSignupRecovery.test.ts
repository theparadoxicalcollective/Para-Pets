import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { registerAccountRoutes } from "../server/routes/account.routes";
import { AccountConflictError } from "../server/accounts/errors";
import { publicAccount } from "../server/accounts/publicAccount";
import { registrationSchema } from "../shared/accountValidation";

type Handler = (req: any, res: any, next?: () => unknown) => unknown;
function harness() {
  const routes = new Map<string, Handler[]>();
  let user: any;
  let delivery: "ok" | "rejected" | "throw" = "ok";
  let failWelcome = false;
  const messages: any[] = [];
  const storage: any = {
    getUserByUsernameCaseInsensitive: async () => undefined,
    getUserByEmail: async () => undefined,
    createUser: async (input: any) => (user = { id: "new-user", emailVerified: false, ...input }),
    getUser: async () => user,
    prepareEmailVerification: async (_id: string, email: string, token: string, expires: Date) => {
      if (user.emailVerified || user.email !== email) return undefined;
      if (!user.emailVerificationToken || user.emailVerificationExpires <= new Date()) {
        Object.assign(user, { emailVerificationToken: token, emailVerificationExpires: expires });
      }
      return user;
    },
    getUserByEmailVerificationToken: async (token: string) => token === user?.emailVerificationToken ? user : undefined,
    verifyEmail: async (_id: string, token: string) => {
      if (token !== user.emailVerificationToken || user.emailVerificationExpires <= new Date()) return false;
      Object.assign(user, { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null });
      return true;
    },
    correctUnverifiedEmail: async (_id: string, email: string, hash: string) => {
      if (user.emailVerified || hash !== user.password) return undefined;
      Object.assign(user, { email, emailVerificationToken: null, emailVerificationExpires: null, passwordResetToken: null, passwordResetExpires: null });
      return user;
    },
  };
  registerAccountRoutes({
    get: (path: string, ...handlers: Handler[]) => routes.set(`GET ${path}`, handlers),
    post: (path: string, ...handlers: Handler[]) => routes.set(`POST ${path}`, handlers),
  } as any, {
    storage,
    isAuthenticated: (req: any, res: any, next: any) => req.user ? next() : res.status(401).json({ message: "Unauthorized" }),
    containsBadWord: async () => false,
    findRecentlyDeletedAccounts: async () => [],
    getFreeHouseBundles: async () => [],
    updateSignupReferrer: async () => {},
    grantWelcomeV2Bundle: async () => { if (failWelcome) throw new Error("simulated outage"); },
    postWatcherMessage: async () => {},
    emailClient: { send: async (message) => {
      messages.push(message);
      if (delivery === "throw") throw new Error("simulated network failure");
      return delivery === "rejected" ? { error: { message: "sender rejected" } } : {};
    } },
  });
  async function invoke(method: string, path: string, request: any = {}) {
    const result: any = { status: 200 };
    const res = { status(code: number) { result.status = code; return res; }, json(body: any) { result.body = body; return res; }, redirect(url: string) { result.redirect = url; return res; } };
    const req = { body: {}, user, login: (_user: any, callback: any) => callback(), ...request };
    const handlers = routes.get(`${method} ${path}`)!;
    const run = (index: number): unknown => handlers[index]?.(req, res, () => run(index + 1));
    await run(0);
    return result;
  }
  const signup = (request: any = {}) => invoke("POST", "/api/auth/register", { body: { username: "New_User", email: "new@example.com", password: "secret123" }, ...request });
  return { signup, invoke, storage, messages, get user() { return user; }, set delivery(value: typeof delivery) { delivery = value; }, set failWelcome(value: boolean) { failWelcome = value; } };
}

test("signup normalizes identifiers without altering passwords or accepting role overrides", () => {
  const input = registrationSchema.parse({ username: " New_User ", email: " NEW@EXAMPLE.COM ", password: " secret ", isAdmin: true });
  assert.equal(input.username, "New_User");
  assert.equal(input.email, "new@example.com");
  assert.equal(input.password, " secret ");
  assert.equal("isAdmin" in input, false);
  for (const input of [{ username: 123, email: "test@example.com", password: "secret" }, { username: "player", email: {}, password: "secret" }, { username: "player", email: "test@example.com", password: "😀".repeat(19) }]) {
    assert.equal(registrationSchema.safeParse(input).success, false);
  }
});

test("safe account responses omit every credential and recovery token", () => {
  const user = { id: "player", email: "player@example.com", coins: 500, password: "hash", passwordResetToken: "reset", passwordResetExpires: new Date(), emailVerificationToken: "verify", emailVerificationExpires: new Date() };
  assert.deepEqual(publicAccount(user), { id: "player", email: "player@example.com", coins: 500 });
  assert.equal(user.passwordResetToken, "reset");
});

test("signup succeeds with secure defaults when welcome rewards or email delivery fail", async () => {
  const h = harness(); h.failWelcome = true; h.delivery = "rejected";
  const result = await h.signup();
  assert.equal(result.status, 201);
  assert.equal(result.body.verificationEmailSent, false);
  assert.equal(result.body.isAdmin, false);
  assert.equal(result.body.isModerator, false);
  assert.equal(result.body.coins, 0);
  assert.equal(await bcrypt.compare("secret123", h.user.password), true);
  assert.equal("password" in result.body, false);
  assert.equal("emailVerificationToken" in result.body, false);
});

test("failed resend reports failure and preserves the original usable link", async () => {
  const h = harness(); await h.signup(); const oldToken = h.user.emailVerificationToken;
  for (const delivery of ["rejected", "throw"] as const) {
    h.delivery = delivery;
    const failed = await h.invoke("POST", "/api/auth/resend-verification");
    assert.equal(failed.status, 503);
    assert.equal(h.user.emailVerificationToken, oldToken);
  }
  h.delivery = "ok";
  assert.equal((await h.invoke("POST", "/api/auth/resend-verification")).status, 200);
  assert.equal(h.user.emailVerificationToken, oldToken);
  const verified = await h.invoke("GET", "/api/auth/verify-email/:token", { params: { token: oldToken } });
  assert.match(verified.redirect, /verified=1$/);
  assert.equal(h.user.emailVerified, true);
});

test("expired links are rejected and can be replaced with a working link", async () => {
  const h = harness(); await h.signup(); const oldToken = h.user.emailVerificationToken;
  h.user.emailVerificationExpires = new Date(Date.now() - 1000);
  assert.match((await h.invoke("GET", "/api/auth/verify-email/:token", { params: { token: oldToken } })).redirect, /verified=expired$/);
  await h.invoke("POST", "/api/auth/resend-verification");
  assert.notEqual(h.user.emailVerificationToken, oldToken);
  assert.match((await h.invoke("GET", "/api/auth/verify-email/:token", { params: { token: oldToken } })).redirect, /verified=invalid$/);
});

test("email correction requires authentication and password and invalidates the old-address link", async () => {
  const h = harness(); await h.signup(); const oldToken = h.user.emailVerificationToken;
  assert.equal((await h.invoke("POST", "/api/auth/change-unverified-email", { user: null })).status, 401);
  assert.equal((await h.invoke("POST", "/api/auth/change-unverified-email", { body: { email: "correct@example.com", password: "wrong" } })).status, 403);
  assert.equal(h.user.email, "new@example.com");
  h.delivery = "rejected";
  const corrected = await h.invoke("POST", "/api/auth/change-unverified-email", { body: { email: " CORRECT@EXAMPLE.COM ", password: "secret123" } });
  assert.equal(corrected.status, 200);
  assert.deepEqual(corrected.body, { email: "correct@example.com", verificationEmailSent: false });
  assert.match((await h.invoke("GET", "/api/auth/verify-email/:token", { params: { token: oldToken } })).redirect, /verified=invalid$/);
  assert.equal(h.messages.at(-1).to, "correct@example.com");
  h.user.emailVerified = true;
  assert.equal((await h.invoke("POST", "/api/auth/change-unverified-email", { body: { email: "other@example.com", password: "secret123" } })).status, 409);
});

test("verification does not succeed if the token changes during consumption", async () => {
  const h = harness(); await h.signup();
  h.storage.verifyEmail = async () => false;
  const result = await h.invoke("GET", "/api/auth/verify-email/:token", { params: { token: h.user.emailVerificationToken } });
  assert.match(result.redirect, /verified=invalid$/);
  assert.equal(h.user.emailVerified, false);
});

test("a post-insert session failure directs the player to login instead of creating another account", async () => {
  const h = harness();
  const result = await h.signup({ login: (_user: any, callback: any) => callback(new Error("session unavailable")) });
  assert.equal(result.status, 503);
  assert.equal(result.body.accountCreated, true);
  assert.ok(h.user.id);
});

test("a conflicting simultaneous signup gets a useful field error", async () => {
  const h = harness();
  h.storage.createUser = async () => { throw new AccountConflictError("email"); };
  const result = await h.signup();
  assert.equal(result.status, 409);
  assert.equal(result.body.field, "email");
});

test("a reset token revoked during password hashing cannot change the password", async () => {
  const h = harness(); await h.signup();
  const originalPassword = h.user.password;
  h.storage.getUserByResetToken = async () => ({ ...h.user, passwordResetExpires: new Date(Date.now() + 60_000) });
  h.storage.resetPasswordWithToken = async () => false;
  const result = await h.invoke("POST", "/api/auth/reset-password", { body: { token: "revoked-during-request", newPassword: "new-secret" } });
  assert.equal(result.status, 400);
  assert.equal(h.user.password, originalPassword);
});
