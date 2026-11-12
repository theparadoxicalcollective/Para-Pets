import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicAccount } from "../server/accounts/publicAccount";

const read = (path: string) => readFileSync(path, "utf8");

test("profile entry shows portrait actions, sign-in Hub artwork, Settings, Support, then Logout", () => {
  const panel = read("client/src/components/UserProfilePanel.tsx");
  const auth = read("client/src/pages/AuthPage.tsx");
  for (const id of [
    "button-profile-pic-change", "button-update-profile-picture",
    "button-remove-profile-picture", "button-para-pets-hub",
    "button-toggle-account-settings", "profile-account-settings",
    "button-toggle-feedback", "button-logout",
  ]) assert.ok(panel.includes(id), id);
  const order = ["profile-portrait-controls","button-para-pets-hub","button-toggle-account-settings",
    "button-toggle-feedback","button-logout"].map(id => panel.indexOf(id));
  assert.ok(order.every(x => x >= 0) && order.every((x,i) => i === 0 || x > order[i - 1]));
  assert.match(panel, /showAccountSettings && \(/);
  assert.match(panel, /aria-expanded=\{showAccountSettings\}/);
  assert.match(panel, /setShowAccountSettings\(false\); setFeedbackSent/);
  assert.match(panel, /<img src=\{paraPetsHubButton\}/);
  assert.match(auth, /import paraPetsHubButton from "@assets\/uploads\/ParaPetsHubButton\.png"/);
  assert.match(panel, /import paraPetsHubButton from "@assets\/uploads\/ParaPetsHubButton\.png"/);
  assert.match(panel, /onClose\(\); navigate\("\/hub"\)/);
});

test("Settings contains the existing username/password/time zone controls plus verified email", () => {
  const panel = read("client/src/components/UserProfilePanel.tsx");
  const keys = [
    "button-save-username","profile-email-settings","button-request-email-change",
    "profile-time-zone-settings","button-save-time-zone",
    "button-toggle-change-password","button-save-password","button-show-delete-account",
  ];
  const from = panel.indexOf('id="profile-account-settings"');
  const to = panel.indexOf("{/* Feedback Section */}",from);
  assert.ok(from > 0 && to > from);
  for (const id of keys) assert.ok(panel.slice(from,to).includes(id), id);
  assert.match(panel, /currentPassword: emailPassword/);
  assert.match(panel, /Your current email remains active until confirmed/);
  assert.match(panel, /onClose\(\); navigate\("\/hub"\)/);
});

test("remove photo uses a null write and game mascot fallback on both Home and Settings", () => {
  const panel = read("client/src/components/UserProfilePanel.tsx");
  const topBar = read("client/src/components/TopBar.tsx");
  const fallback = read("client/src/lib/defaultPlayerProfileImage.ts");
  const routes = read("server/routes.ts");
  const storage = read("server/storage.ts");
  assert.match(fallback, /@assets\/hub_mascot\.png/);
  assert.match(panel, /src=\{profilePreview \|\| user\.profileImage \|\| DEFAULT_PLAYER_PROFILE_IMAGE\}/);
  assert.match(topBar, /src=\{DEFAULT_PLAYER_PROFILE_IMAGE\}/);
  assert.match(panel, /"PATCH", "\/api\/user\/profile-image", \{ profileImageData: null \}/);
  assert.match(panel, /setProfilePreview\(null\)/);
  assert.doesNotMatch(panel, /text-black text-xs font-bold leading-none">\+</);
  assert.match(routes, /if \(profileImageData === null\) \{/);
  assert.match(routes, /storage\.updateProfileImage\(user\.id, null\)/);
  assert.match(storage, /updateProfileImage\(id: string, profileImage: string \| null\)/);
});

test("email change requires password and one-time verification, not an immediate email update", () => {
  const route = read("server/routes/emailChange.routes.ts");
  const routes = read("server/routes.ts");
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/runEssentialBoot.ts");
  assert.match(routes, /registerEmailChangeRoutes\(app, \{ db, isAuthenticated \}\)/);
  assert.match(route, /app\.post\("\/api\/user\/email-change\/request", isAuthenticated/);
  assert.match(route, /bcrypt\.compare\(currentPassword, user\.password\)/);
  assert.match(route, /crypto\.randomBytes\(32\)/);
  assert.match(route, /crypto\.createHash\("sha256"\)/);
  assert.match(route, /pendingEmail: email, pendingEmailTokenHash: hash/);
  assert.match(route, /if \(result\.error\) throw/);
  assert.match(route, /app\.get\("\/api\/user\/email-change\/verify\/:token"/);
  assert.match(route, /gt\(users\.pendingEmailExpires, new Date\(\)\)/);
  assert.match(route, /pg_advisory_xact_lock/);
  assert.match(route, /email: pending\.pendingEmail, emailVerified: true/);
  assert.match(route, /pendingEmailTokenHash: null/);
  assert.match(schema, /pendingEmail: text\("pending_email"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS pending_email_token_hash TEXT/);
});

test("time zone dropdown has a short set of regions with legacy selected values preserved", () => {
  const source = read("client/src/components/PlayerTimeZoneSelect.tsx");
  const options = [...source.matchAll(/\["(?:UTC|[A-Za-z_]+\/[A-Za-z_]+)",/g)];
  assert.ok(options.length >= 8 && options.length <= 20);
  assert.doesNotMatch(source, /supportedValuesOf/);
  assert.match(source, /isValidPlayerTimeZone\(value\)/);
  assert.match(source, /value\.replaceAll\("_", " "\)/);
  assert.match(source, /min-h-11/);
});

test("pending email and recovery secrets never leave public account serialization", () => {
  const publicUser = publicAccount({
    id: "u1", email: "old@example.com", username: "player",
    password: "secret", emailVerificationToken: "verify",
    emailVerificationExpires: new Date(), passwordResetToken: "reset",
    passwordResetExpires: new Date(),
    pendingEmail: "new@example.com",
    pendingEmailTokenHash: "do-not-expose",
    pendingEmailExpires: new Date(), pendingEmailRequestedAt: new Date(),
  });
  assert.deepEqual(publicUser, { id: "u1", email: "old@example.com", username: "player" });
});
