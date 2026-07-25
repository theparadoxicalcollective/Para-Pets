import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fishingSource = readFileSync("client/src/pages/FishingPage.tsx", "utf8");
const worldSource = readFileSync("client/src/pages/WorldPage.tsx", "utf8");

test("fishing attempt reset is local and never leaves the world location", () => {
  const resetBody = fishingSource.match(
    /const resetFishing = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[clearAllTimers, locationId\]\);/,
  )?.[1];

  assert.ok(resetBody, "expected to find resetFishing");
  assert.match(resetBody, /setPhase\("idle"\)/);
  assert.match(resetBody, /setCaughtItem\(null\)/);
  assert.doesNotMatch(resetBody, /onClose/);
});

test("equipment callbacks only mutate equipment or close their picker", () => {
  const equipmentSection = fishingSource.slice(
    fishingSource.indexOf("{showPolePanel && ("),
    fishingSource.indexOf("{showFishInv && ("),
  );

  assert.match(equipmentSection, /equipMutation\.mutate/);
  assert.match(equipmentSection, /setShowPolePanel\(false\)/);
  assert.match(equipmentSection, /setShowBaitPanel\(false\)/);
  assert.doesNotMatch(equipmentSection, /onClose\(\)/);
});

test("fishing overlay is retained independently of location query refreshes", () => {
  assert.match(
    worldSource,
    /const \[fishingLocation, setFishingLocation\] = useState<WorldLocationData \| null>\(null\)/,
  );
  assert.match(worldSource, /\{fishingLocation && \(/);
  assert.doesNotMatch(
    worldSource,
    /showFishing && activeLocationId && \(\(\) =>[\s\S]*?locations\.find/,
  );
});

test("only the explicit FishingPage close callback clears the active fishing location", () => {
  const overlay = worldSource.slice(
    worldSource.indexOf("{fishingLocation && ("),
    worldSource.indexOf("{showSellFish && ("),
  );

  assert.match(overlay, /onClose=\{\(\) => \{/);
  assert.match(overlay, /setFishingLocation\(null\)/);
  assert.match(overlay, /setActiveLocationId\(null\)/);
  assert.equal((overlay.match(/setActiveLocationId\(null\)/g) ?? []).length, 1);
});

test("catch and equipment refreshes do not invalidate world locations", () => {
  const mutationSection = fishingSource.slice(
    fishingSource.indexOf("const equipMutation"),
    fishingSource.indexOf("const addPondFishMutation"),
  );

  assert.doesNotMatch(mutationSection, /\/api\/world.*locations/);
  assert.doesNotMatch(mutationSection, /setActiveLocationId|setFishingLocation/);
});

test("completion uses the authoritative outcome and terminal transitions clear pending timers", () => {
  const mutationSection = fishingSource.slice(
    fishingSource.indexOf("const catchMutation"),
    fishingSource.indexOf("const addPondFishMutation"),
  );
  assert.match(mutationSection, /fishingCompletionOutcome\(data\) === "caught"/);
  assert.match(mutationSection, /clearAllTimers\(\)/);
  assert.match(mutationSection, /phaseRef\.current = "caught"/);
  assert.doesNotMatch(mutationSection, /onError:[\s\S]*?setPhase\("missed"\)/);
});

test("a duplicate completion callback or late reel miss cannot replace a submitted catch", () => {
  const reelCallbacks = fishingSource.slice(
    fishingSource.indexOf("onCaught={() =>"),
    fishingSource.indexOf("accent={accent}"),
  );
  assert.match(reelCallbacks, /if \(completionSubmittedRef\.current\) return/);
  assert.match(reelCallbacks, /completionSubmittedRef\.current = true/);
  assert.match(reelCallbacks, /if \(completionSubmittedRef\.current \|\| phaseRef\.current !== "reeling"\) return/);
  assert.match(reelCallbacks, /clearAllTimers\(\)/);
});

test("all fishing worlds reuse the single FishingPage implementation", () => {
  assert.match(worldSource, /import FishingPage from "@\/pages\/FishingPage"/);
  assert.match(worldSource, /<FishingPage/);
  assert.doesNotMatch(worldSource, /BayouFishingPage|VolcanicFishingPage/);
});
