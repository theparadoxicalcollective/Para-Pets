import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Pet Care redirects missing pets after render instead of navigating during render", () => {
  const page = readFileSync("client/src/pages/PetCarePage.tsx", "utf8");
  const missingPetBranch = page.slice(page.indexOf("if (!pet)"), page.indexOf("const housePet"));

  assert.match(page, /useEffect\(\(\) => \{/);
  assert.match(page, /hasRedirectedRef\.current = true;\s*close\(\);/);
  assert.doesNotMatch(missingPetBranch, /close\(\)/);
});
