import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navSource = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("Pet House remains available and Pet Park is open in nav for all players", () => {
  assert.match(navSource, /label: "Pet Park"/);
  assert.match(navSource, /const isLocked = false/);
  assert.doesNotMatch(navSource, /item\.id === "keepers" && !isStaff/);
});
