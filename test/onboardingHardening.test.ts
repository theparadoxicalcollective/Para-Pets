import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerAccountRoutes } from "../server/routes/account.routes";

type Handler = (req: any, res: any, next?: () => unknown) => unknown;

const rootEntrySource = readFileSync("client/src/RootEntry.tsx", "utf8");
const welcomeSource = readFileSync("client/src/components/WelcomeGiftScreen.tsx", "utf8");
const authPageSource = readFileSync("client/src/pages/AuthPage.tsx", "utf8");
const accountRoutesSource = readFileSync("server/routes/account.routes.ts", "utf8");

test("email verification is enforced above navigation-specific route behavior", () => {
  assert.match(rootEntrySource, /user && !user\.emailVerified && !isVerificationExemptPath\(location\)/);
  assert.match(rootEntrySource, /<EmailGateScreen email=\{user\.email\} \/>/);
  assert.match(rootEntrySource, /path === "\/hub" \|\| path === "\/privacy" \|\| path\.startsWith\("\/reset-password\/"\)/);
  assert.doesNotMatch(rootEntrySource, /isVerificationExemptPath[\s\S]{0,300}shouldHideNav/);
});

test("welcome gift provisioning can recover or safely let the player continue", () => {
  assert.match(welcomeSource, /POST", "\/api\/auth\/reconcile-onboarding"/);
  assert.match(welcomeSource, /data-testid="button-retry-welcome-setup"/);
  assert.match(welcomeSource, /data-testid="button-continue-without-welcome"/);
  assert.match(welcomeSource, /catch \{\}[\s\S]{0,120}GET", "\/api\/rewards\/pending"/);
  assert.match(welcomeSource, /setupNeedsRetry = isError \|\| \(isSuccess && !welcomeReward\)/);
  assert.match(authPageSource, /reconcile-onboarding"\)\.catch\(\(\) => \{\}\)/);
  assert.doesNotMatch(
    welcomeSource,
    /if \(!isError\) return;[\s\S]{0,180}localStorage\.removeItem\("para_pets_just_registered"\)/,
  );
});

test("onboarding reconciliation repairs partial provisioning and is safe to repeat", async () => {
  const routes = new Map<string, Handler[]>();
  const user: any = { id: "new-user", activeHouseBundleId: null };
  const owned = new Set<string>();
  let failWelcome = true;
  let failHouseGrant = true;
  let houseGrantCalls = 0;

  const storage: any = {
    getUser: async () => user,
    hasUserHouseBundle: async (_userId: string, bundleId: string) => owned.has(bundleId),
    grantUserHouseBundle: async (_userId: string, bundleId: string) => {
      houseGrantCalls++;
      if (failHouseGrant) {
        failHouseGrant = false;
        throw new Error("simulated house setup outage");
      }
      owned.add(bundleId);
      return { userId: user.id, bundleId };
    },
    setActiveHouseBundle: async (_userId: string, bundleId: string | null) => {
      user.activeHouseBundleId = bundleId;
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
    getFreeHouseBundles: async () => [{ id: "free-a" }, { id: "free-b" }],
    updateSignupReferrer: async () => {},
    grantWelcomeV2Bundle: async () => {
      if (failWelcome) throw new Error("simulated welcome outage");
    },
    postWatcherMessage: async () => {},
  });

  async function reconcile() {
    const result: any = { status: 200 };
    const res = {
      status(code: number) { result.status = code; return res; },
      json(body: any) { result.body = body; return res; },
    };
    const req = { user, body: {} };
    const handlers = routes.get("POST /api/auth/reconcile-onboarding")!;
    const run = (index: number): unknown => handlers[index]?.(req, res, () => run(index + 1));
    await run(0);
    return result;
  }

  const unavailable = await reconcile();
  assert.equal(unavailable.status, 503);
  assert.deepEqual(unavailable.body, {
    ok: false,
    welcomeReady: false,
    houseReady: false,
    message: "Your welcome reward is still being prepared. Please retry in a moment.",
  });
  assert.equal(owned.size, 0);

  failWelcome = false;
  failHouseGrant = true;
  const welcomeOnly = await reconcile();
  assert.equal(welcomeOnly.status, 200);
  assert.deepEqual(welcomeOnly.body, { ok: true, welcomeReady: true, houseReady: false });
  assert.equal(owned.size, 0);

  const repaired = await reconcile();
  assert.equal(repaired.status, 200);
  assert.deepEqual(repaired.body, { ok: true, welcomeReady: true, houseReady: true });
  assert.deepEqual([...owned].sort(), ["free-a", "free-b"]);
  assert.equal(user.activeHouseBundleId, "free-a");
  assert.equal(houseGrantCalls, 4);

  user.activeHouseBundleId = "player-choice";
  const repeated = await reconcile();
  assert.equal(repeated.status, 200);
  assert.equal(user.activeHouseBundleId, "player-choice");
  assert.equal(houseGrantCalls, 4);

  assert.match(accountRoutesSource, /hasUserHouseBundle\(userId, bundle\.id\)/);
  assert.match(accountRoutesSource, /if \(user && !user\.activeHouseBundleId\)/);
});
