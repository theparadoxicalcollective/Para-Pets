import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale } from "../client/src/lib/worldViewport";

test("short Safari world view uses the same cover presentation as the installed app", () => {
  const scale = calculateWorldFitScale(390, 760, 1621, true);
  assert.equal(scale, 760 / 1621);
  assert.ok(1080 * scale >= 390);
  assert.ok(1621 * scale >= 760);
});

test("standalone portrait world view preserves the cover presentation", () => {
  const scale = calculateWorldFitScale(390, 844, 1621, false);
  assert.equal(scale, 844 / 1621);
  assert.ok(1080 * scale >= 390);
  assert.ok(1621 * scale >= 844);
});

test("browser display mode cannot change a world's fit for the same viewport", () => {
  const browser = calculateWorldFitScale(390, 760, 1440, true);
  const installed = calculateWorldFitScale(390, 760, 1440, false);
  assert.equal(browser, installed);
});
