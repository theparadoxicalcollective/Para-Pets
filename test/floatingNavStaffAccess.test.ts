import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navSource = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("Pet Home and Central unlock for administrators and moderators", () => {
  assert.match(navSource, /const isStaff = user\.isAdmin \|\| user\.isModerator === true/);
  assert.match(navSource, /\(item\.id === "pethouse" \|\| item\.id === "keepers"\) && !isStaff/);
});
