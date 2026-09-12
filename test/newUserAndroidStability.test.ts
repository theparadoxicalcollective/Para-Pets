import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const auth = readFileSync("client/src/pages/AuthPage.tsx", "utf8");
const welcome = readFileSync("client/src/components/WelcomeGiftScreen.tsx", "utf8");
const petCareSafeMode = readFileSync("client/src/lib/petCareSafeMode.ts", "utf8");

test("new-account welcome state belongs to the registering user", () => {
  assert.match(auth, /para_pets_just_registered_user_id/);
  assert.match(app, /pendingUserId === userId/);
  assert.match(welcome, /removeItem\("para_pets_just_registered_user_id"\)/);
});

test("the global navigation swipe workaround is limited to iOS", () => {
  assert.match(app, /if \(!runtime\.displayMode\.startsWith\("ios-"\)\) return/);
});

test("normal Pet Care phases stay local and only recovered terminations are reported", () => {
  const writeBody = petCareSafeMode.match(/export function writePetCarePhase[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(writeBody, /sendPhase/);
  assert.match(petCareSafeMode, /reportRecoveredPetCarePhase[\s\S]*?sendPhase/);
});
