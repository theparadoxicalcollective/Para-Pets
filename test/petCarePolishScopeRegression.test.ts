import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Pet Care no longer installs a global polish controller", () => {
  const main = readFileSync("client/src/main.tsx", "utf8");
  assert.equal(existsSync("client/src/petCarePolish.ts"), false);
  assert.equal(existsSync("client/src/petCarePolishBootstrap.ts"), false);
  assert.doesNotMatch(main, /installPetCareDragPolish|installScopedPetCareDragPolish/);
});

test("Pet Care owns only lifecycle safety listeners outside its overlay", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.doesNotMatch(page, /MutationObserver|queryCache\.subscribe|setInterval\(refreshPetCareScope/);
  assert.match(page, /window\.addEventListener\("pagehide", cancelForLifecycle\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(page, /window\.removeEventListener\("pagehide", cancelForLifecycle\)/);
  assert.match(page, /document\.removeEventListener\("visibilitychange", onVisibility\)/);
});
