import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navSource = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("Pet House remains available to players while Central is staff-only", () => {
  assert.match(navSource, /const isStaff = user\.isAdmin \|\| user\.isModerator === true/);
  assert.match(navSource, /const isLocked = item\.id === "keepers" && !isStaff/);
});
