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
  assert.match(queryClient, /detail: \{ activePetId: typeof activePetId === "string" \? activePetId : null \}/);
});

test("Begin Journey advances step 2 from the confirmed active-pet acknowledgement", () => {
  assert.match(beginJourney, /ACTIVE_PET_UPDATE_CONFIRMED_EVENT/);
  assert.match(beginJourney, /if \(bjGetStep\(\) === 2 && activePetId\) \{\s*bjSetStep\(3\);/);
});

test("a deselection acknowledgement cannot advance the tutorial", () => {
  assert.match(beginJourney, /const activePetId = .*detail\?\.activePetId/);
  assert.match(beginJourney, /bjGetStep\(\) === 2 && activePetId/);
  assert.doesNotMatch(beginJourney, /bjGetStep\(\) === 2\) \{\s*bjSetStep\(3\)/);
});

test("the acknowledgement listener is installed once across hot reloads", () => {
  assert.match(beginJourney, /__paraBjActivePetAckInstalled/);
  assert.match(beginJourney, /if \(!tutorialWindow\.__paraBjActivePetAckInstalled\)/);
});
