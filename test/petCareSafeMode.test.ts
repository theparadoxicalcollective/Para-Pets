import assert from "node:assert/strict";
import test from "node:test";
import {
  PET_CARE_PHASE_KEY,
  clearPetCarePhase,
  readRecoverablePetCarePhase,
  sanitizePetCareRoute,
  shouldUsePetCareSafeMode,
  type PetCarePhaseRecord,
} from "../client/src/lib/petCareSafeMode";
import type { RuntimeMode } from "../client/src/lib/runtimeMode";

const runtime = (displayMode: RuntimeMode["displayMode"]): RuntimeMode => ({
  displayMode, isStandalone: displayMode === "ios-standalone", browserClassification: displayMode,
});

test("Pet Care defaults all iOS runtime modes to safe mode with controlled overrides", () => {
  assert.equal(shouldUsePetCareSafeMode(runtime("ios-browser"), ""), true);
  assert.equal(shouldUsePetCareSafeMode(runtime("ios-embedded"), ""), true);
  assert.equal(shouldUsePetCareSafeMode(runtime("ios-standalone"), ""), true);
  assert.equal(shouldUsePetCareSafeMode(runtime("desktop"), "?petCareSafe=1"), true);
  assert.equal(shouldUsePetCareSafeMode(runtime("ios-browser"), "?petCareSafe=0"), false);
  assert.equal(shouldUsePetCareSafeMode(runtime("ios-browser"), "?petCareSafe=0", true), true);
});

test("phase diagnostics remove the pet identifier from the route", () => {
  assert.equal(sanitizePetCareRoute("/pet-care/private-inventory-id"), "/pet-care/:pet");
  assert.equal(sanitizePetCareRoute("/pet-care"), "/pet-care");
});

test("an incomplete recent phase is recoverable but completed and expired phases are not", () => {
  const now = 10_000_000;
  const record: PetCarePhaseRecord = {
    version: 1, buildId: "test", timestamp: now - 1_000, route: "/pet-care/example",
    runtimeMode: "ios-browser", safeMode: true, phase: "mutation-started",
    interactionId: "interaction", itemType: "edibles",
  };
  const storage = { getItem: () => JSON.stringify(record) };
  assert.deepEqual(readRecoverablePetCarePhase(storage, now), record);
  assert.equal(readRecoverablePetCarePhase({ getItem: () => JSON.stringify({ ...record, phase: "cleanup-complete" }) }, now), null);
  assert.equal(readRecoverablePetCarePhase({ getItem: () => JSON.stringify({ ...record, timestamp: now - 300_000 }) }, now), null);
});

test("successful cleanup removes the active versioned phase marker", () => {
  const removed: string[] = [];
  clearPetCarePhase({ removeItem: (key) => { removed.push(key); } });
  assert.deepEqual(removed, [PET_CARE_PHASE_KEY]);
});
