import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
test("Active Pet chrome reads the same rendered container that owns pet placement", () => {
  assert.match(home, /const activePetSceneRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(home, /new ResizeObserver\(update\)/);
  assert.match(home, /observer\.observe\(element\)/);
  assert.match(home, /activePetSceneRef\.current = element/);
  assert.match(home, /petChromeAnchorOffset\(activePetAnchorQuery\.anchor, activePetSceneRect\\.width\)/);
  assert.doesNotMatch(home, /petChromeAnchorOffset\(activePetAnchorQuery\.anchor, Math\.min\(/);
});
