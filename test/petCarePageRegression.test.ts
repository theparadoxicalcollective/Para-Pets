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

test("Pet Care exposes recoverable loading failures instead of rendering incomplete data", () => {
  const page = readFileSync("client/src/pages/PetCarePage.tsx", "utf8");

  assert.match(page, /userQuery\.isError \|\| inventoryQuery\.isError/);
  assert.match(page, /data-testid="pet-care-error"/);
  assert.match(page, /Promise\.all\(\[userQuery\.refetch\(\), inventoryQuery\.refetch\(\)\]\)/);
});

test("Pet Care owns and cleans up animation timers and avoids duplicate background decoding", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const overlay = page.slice(page.indexOf("export function FeedingOverlay"));

  assert.match(overlay, /timeoutIdsRef\.current\.forEach\(\(id\) => window\.clearTimeout\(id\)\)/);
  assert.match(overlay, /window\.clearInterval\(gesture\.heartTimer\)/);
  assert.match(overlay, /window\.clearInterval\(gesture\.sparkleTimer\)/);
  assert.doesNotMatch(overlay, /new Image\(\)/);
});
