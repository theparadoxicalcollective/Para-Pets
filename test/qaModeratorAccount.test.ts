import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const provisioner = readFileSync("server/startup/ensureQaModeratorAccount.ts", "utf8");
const startup = readFileSync("server/startup/runStartup.ts", "utf8");

test("QA moderator provisioning is opt-in and never weakens normal registration", () => {
  assert.match(provisioner, /QA_MOD_ACCOUNT_ENABLED/);
  assert.match(provisioner, /QA_MOD_USERNAME/);
  assert.match(provisioner, /QA_MOD_EMAIL/);
  assert.match(provisioner, /QA_MOD_PASSWORD/);
  assert.match(provisioner, /return \{ enabled: false \}/);
  assert.doesNotMatch(readFileSync("server/routes/account.routes.ts", "utf8"), /QA_MOD_ACCOUNT_ENABLED|QA_MOD_PASSWORD/);
});

test("QA account is verified moderator-only and cannot become admin or bot", () => {
  assert.match(provisioner, /isAdmin: false/);
  assert.match(provisioner, /isModerator: true/);
  assert.match(provisioner, /isBot: false/);
  assert.match(provisioner, /emailVerified: true/);
  assert.match(provisioner, /emailVerificationToken: null/);
  assert.match(provisioner, /emailVerificationExpires: null/);
});

test("QA account password remains hashed and can rotate from Railway variables", () => {
  assert.match(provisioner, /bcrypt\.hash\(password, 10\)/);
  assert.match(provisioner, /bcrypt\.compare\(password, user\.password\)/);
  assert.match(provisioner, /password: nextPassword/);
  assert.doesNotMatch(provisioner, /password:\s*process\.env\.QA_MOD_PASSWORD/);
});

test("QA provisioning refuses to repurpose an unrelated existing player", () => {
  assert.match(provisioner, /username\/email collides with an existing account; refusing to repurpose it/);
  assert.match(provisioner, /getUserByUsernameCaseInsensitive\(username\)/);
  assert.match(provisioner, /getUserByEmail\(email\)/);
  assert.match(provisioner, /pg_advisory_lock/);
  assert.match(provisioner, /pg_advisory_unlock/);
});

test("startup account provisioning is non-fatal to the live game", () => {
  assert.match(startup, /await ensureQaModeratorAccount\(\)/);
  assert.match(startup, /\[qa\] moderator account provisioning skipped/);
  assert.match(startup, /try \{[\s\S]*?ensureQaModeratorAccount[\s\S]*?\} catch/);
});
