import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const queryClient = readFileSync("client/src/lib/queryClient.ts", "utf8");
const beginJourney = readFileSync("client/src/lib/beginJourney.ts", "utf8");

test("active-pet acknowledgement is emitted only after a successful PATCH", () => {
  const successCheck = queryClient.indexOf("await throwIfResNotOk(res);");
  const dispatch = queryClient.indexOf("window.dispatchEvent(new CustomEvent(ACTIVE_PET_UPDATE_CONFIRMED_EVENT");
  assert.ok(successCheck >= 0 && dispatch > successCheck);
  assert.match(queryClient, /method\.toUpperCase\(\) === "PATCH"/);
  assert.match(queryClient, /url === "\/api\/user\/active-pet"/);
  assert.match(queryClient, /detail: \{ activePetId \}/);
});

test("Begin Journey advances only when step 3 activates the chosen inventory row", () => {
  assert.match(beginJourney, /ACTIVE_PET_UPDATE_CONFIRMED_EVENT/);
  assert.match(beginJourney, /bjGetStep\(\) === 3/);
  assert.match(beginJourney, /activePetId === bjGetStarterInventoryId\(\)/);
  assert.match(beginJourney, /bjSetStep\(4\)/);
});

test("deselection or a different owned pet cannot advance the tutorial", () => {
  assert.match(beginJourney, /activePetId &&/);
  assert.doesNotMatch(beginJourney, /bjGetStep\(\) === 3 && activePetId\) \{/);
});

test("the acknowledgement listener is installed once across hot reloads", () => {
  assert.match(beginJourney, /__paraBjActivePetAckInstalled/);
  assert.match(beginJourney, /if \(!tutorialWindow\.__paraBjActivePetAckInstalled\)/);
});
