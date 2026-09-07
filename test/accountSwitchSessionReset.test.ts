import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = readFileSync("client/src/RootEntry.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const profile = readFileSync("client/src/components/UserProfilePanel.tsx", "utf8");
const accountRoutes = readFileSync("server/routes/account.routes.ts", "utf8");

test("account changes remount the game and restart player-specific preload", () => {
  assert.match(root, /<App key=\{user\.id\} \/>/);
  assert.match(app, /setIsPreloaded\(false\);[\s\S]*?if \(!user\) return/);
  assert.doesNotMatch(app, /if \(!user \|\| isPreloaded\) return/);
});

test("an authoritative auth 401 cannot retain the previous player", () => {
  assert.match(app, /response\.status === 401[\s\S]*?return null/);
  assert.doesNotMatch(app, /retainedAuthenticatedUser|Authentication validation temporarily failed/);
  assert.match(root, /queryFn: async \(\{ signal \}\)/);
  assert.match(root, /credentials: "include", signal/);
  assert.match(root, /refetchInterval: query => query\.state\.data \? 30_000 : false/);
  assert.doesNotMatch(root, /refetchInterval: 1_000/);
});

test("logout clears browser player state and destroys the server session", () => {
  assert.match(profile, /replaceAuthSession\(null, queryClient\)/);
  assert.match(profile, /window\.location\.replace\("\/"\)/);
  assert.match(accountRoutes, /req\.session\.destroy/);
  assert.match(accountRoutes, /res\.clearCookie\("connect\.sid"/);
  assert.match(accountRoutes, /sameSite: process\.env\.NODE_ENV === "production" \? "none" : "lax"/);
});
