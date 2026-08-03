import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("active pet uses the restored responsive home flow", () => {
  const page = readFileSync("client/src/pages/HomePage.tsx", "utf8");

  assert.match(
    page,
    /className="relative flex items-center justify-center w-full max-w-\[520px\] md:max-w-\[680px\] lg:max-w-\[800px\]"/,
  );
  assert.match(
    page,
    /style=\{\{ marginBottom: activePet \? "calc\(26\*var\(--vh\)\)" : undefined \}\}/,
  );
  assert.doesNotMatch(page, /className="home-active-pet-stage"/);
});
