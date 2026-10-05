import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync("server/routes.ts", "utf8");
const storage = readFileSync("server/storage.ts", "utf8");
const adminPage = readFileSync("client/src/pages/AdminPage.tsx", "utf8");

test("admin user payload marks only configured QA identities as special members", () => {
  assert.match(routes, /isSpecialMember: isConfiguredQaIdentity\(user\)/);
  assert.match(routes, /specialMemberRole: isConfiguredQaIdentity\(user\) \? "QA Tester" : null/);
});

test("Members tab separates regular players from Special Members", () => {
  assert.match(adminPage, /Regular Members/);
  assert.match(adminPage, /Special Members/);
  assert.match(adminPage, /Reserved QA testing accounts/);
  assert.match(adminPage, /regularMembers = sortedMembers\.filter\(member => !member\.isSpecialMember\)/);
  assert.match(adminPage, /specialMembers = sortedMembers\.filter\(member => member\.isSpecialMember\)/);
  assert.match(adminPage, /member\.specialMemberRole \?\? "QA Tester"/);
});

test("reserved QA moderators stay off the public team roster", () => {
  assert.match(storage, /@qa\.parapets\.invalid/);
  assert.match(storage, /NOT ILIKE '%@qa\.parapets\.invalid'/);
});
