import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("shared world location UI hook owns the common overlay state", () => {
  const hook = read("client/src/worlds/useWorldLocationUiState.ts");

  assert.match(hook, /const \[activeLocationId, setActiveLocationId\] = useState<string \| null>\(null\)/);
  assert.match(hook, /const \[showLocationView, setShowLocationView\] = useState\(false\)/);
  assert.match(hook, /const \[showShop, setShowShop\] = useState\(false\)/);
  assert.match(hook, /const \[fishingLocation, setFishingLocation\] = useState<WorldLocationData \| null>\(null\)/);
  assert.match(hook, /const \[showDangerWarning, setShowDangerWarning\] = useState\(false\)/);
  assert.match(hook, /const \[showNoPetMessage, setShowNoPetMessage\] = useState\(false\)/);
  assert.match(hook, /const shopJustOpened = useRef<number>\(0\)/);
  assert.match(hook, /const showFishing = fishingLocation !== null/);
});

test("fishing transition preserves the current overlay semantics", () => {
  const hook = read("client/src/worlds/useWorldLocationUiState.ts");

  assert.match(
    hook,
    /const openFishingLocation = useCallback\(\(location: WorldLocationData\) => \{[\s\S]*?setShowLocationView\(false\);[\s\S]*?setShowShop\(false\);[\s\S]*?setFishingLocation\(location\);/,
  );
});

test("shop transition clears conflicting location UI and records open time", () => {
  const hook = read("client/src/worlds/useWorldLocationUiState.ts");

  assert.match(
    hook,
    /const openShopLocation = useCallback\(\(\) => \{[\s\S]*?setFishingLocation\(null\);[\s\S]*?setShowLocationView\(false\);[\s\S]*?setShowShop\(true\);[\s\S]*?shopJustOpened\.current = Date\.now\(\);/,
  );
});

test("danger and scenic transitions preserve their existing state changes", () => {
  const hook = read("client/src/worlds/useWorldLocationUiState.ts");

  assert.match(
    hook,
    /const openDangerLocation = useCallback\(\(\) => \{[\s\S]*?setFishingLocation\(null\);[\s\S]*?setShowDangerWarning\(true\);/,
  );
  assert.match(
    hook,
    /const openScenicLocation = useCallback\(\(\) => \{[\s\S]*?setFishingLocation\(null\);[\s\S]*?setShowShop\(false\);[\s\S]*?setShowLocationView\(true\);/,
  );
});

test("no-pet and fishing-close helpers preserve the existing warning/close behavior", () => {
  const hook = read("client/src/worlds/useWorldLocationUiState.ts");

  assert.match(
    hook,
    /const showNoPetWarning = useCallback\(\(\) => \{[\s\S]*?setShowNoPetMessage\(true\);/,
  );
  assert.match(
    hook,
    /const closeFishingLocation = useCallback\(\(\) => \{[\s\S]*?setFishingLocation\(null\);[\s\S]*?setActiveLocationId\(null\);/,
  );
});

test("WorldPage consumes the shared UI controller instead of declaring duplicate location state", () => {
  const page = read("client/src/pages/WorldPage.tsx");

  assert.match(
    page,
    /import \{ useWorldLocationUiState \} from "@\/worlds\/useWorldLocationUiState"/,
  );
  assert.match(page, /\} = useWorldLocationUiState\(\)/);

  for (const declaration of [
    /const \[activeLocationId, setActiveLocationId\] = useState/,
    /const \[showLocationView, setShowLocationView\] = useState/,
    /const \[showShop, setShowShop\] = useState/,
    /const \[fishingLocation, setFishingLocation\] = useState/,
    /const \[showDangerWarning, setShowDangerWarning\] = useState/,
    /const \[showNoPetMessage, setShowNoPetMessage\] = useState/,
    /const shopJustOpened = useRef/,
  ]) {
    assert.doesNotMatch(page, declaration);
  }
});

test("WorldPage applies resolver results through the UI controller helpers", () => {
  const page = read("client/src/pages/WorldPage.tsx");
  const openStart = page.indexOf("const openLocation = useCallback");
  const clickStart = page.indexOf("const handleLocationClick = useCallback", openStart);
  assert.ok(openStart >= 0 && clickStart > openStart);
  const section = page.slice(openStart, clickStart);

  assert.match(section, /case "fishing":[\s\S]*?openFishingLocation\(loc\)/);
  assert.match(section, /case "shop":[\s\S]*?openShopLocation\(\)[\s\S]*?playShopBell\(\)/);
  assert.match(section, /case "danger-warning":[\s\S]*?openDangerLocation\(\)/);
  assert.match(section, /case "scenic":[\s\S]*?openScenicLocation\(\)/);
  assert.doesNotMatch(section, /setFishingLocation\(loc\)/);
  assert.doesNotMatch(section, /shopJustOpened\.current = Date\.now\(\)/);
});

test("shop close remains local and does not clear the active world location", () => {
  const page = read("client/src/pages/WorldPage.tsx");
  const start = page.indexOf("onClose={() => { setShowShop(false)");
  const end = page.indexOf("/>\n      )}", start);
  assert.ok(start >= 0 && end > start);
  const close = page.slice(start, end);

  assert.match(close, /setShowShop\(false\)/);
  assert.doesNotMatch(close, /setActiveLocationId\(null\)|setFishingLocation\(null\)/);
});
