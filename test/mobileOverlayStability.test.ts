import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const queryClient = readFileSync("client/src/lib/queryClient.ts", "utf8");
const lazyRetry = readFileSync("client/src/lib/lazyWithRetry.ts", "utf8");
const petCare = readFileSync("client/src/pages/PetCarePage.tsx", "utf8");
const clearing = readFileSync("client/src/pages/ElysianBayouClearingPage.tsx", "utf8");
const combat = readFileSync("client/src/components/ElysianClearingCombat.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("chunk guard survives App mount and clears only after a lazy import succeeds", () => {
  assert.doesNotMatch(app, /clearChunkReloadFlag/);
  assert.match(lazyRetry, /const module = await factory\(\);\s*clearChunkReloadFlag\(\)/);
  assert.match(lazyRetry, /looksLikeChunkLoadError && !alreadyReloaded/);
});

test("an authoritative auth 401 clears a previously authenticated overlay", () => {
  assert.match(queryClient, /response\.status === 401[\s\S]*?return null/);
  assert.match(app, /fetchAuthenticatedUser\(signal\)/);
  assert.doesNotMatch(app, /Authentication validation temporarily failed \(401\)/);
  assert.doesNotMatch(app, /retainedAuthenticatedUser/);
});

test("Pet Care and Clearing retain their confirmed pet during inventory refetch", () => {
  assert.match(petCare, /inventoryQuery\.isFetching \? confirmedPetRef\.current/);
  assert.match(clearing, /inventoryQuery\.isFetching \? confirmedActivePetRef\.current/);
  assert.doesNotMatch(petCare, /if \([^)]*!pet[^)]*\)\s*navigate/);
  assert.equal((clearing.match(/navigate\(/g) ?? []).length, 1);
  assert.match(clearing, /const handleBack = \(\) => \{\s*navigate\("\/world\/swamp"\)/);
});

test("Clearing has a single visibility-aware RAF loop with unmount cleanup", () => {
  assert.equal((combat.match(/requestAnimationFrame\(tick\)/g) ?? []).length, 3);
  assert.match(combat, /cancelAnimationFrame\(raf\)/);
  assert.match(combat, /document\.visibilityState!=="visible"/);
  assert.match(combat, /return\(\)=>\{cancelAnimationFrame\(raf\)/);
});

test("hidden HomePage pauses safe background polling", () => {
  assert.match(home, /showWorldChat \|\| isOverlayActive \? false : 15000/);
  assert.ok((home.match(/enabled: !!currentUser && !isOverlayActive/g) ?? []).length >= 1);
});
