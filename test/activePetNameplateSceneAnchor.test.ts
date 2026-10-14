import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
test("hatched pet nameplate uses measured artwork geometry", () => {
  assert.match(home, /activePetGroundViewport\.y \+ Math\.max\(80, activePetSceneRect\.height \* 0\.2\)/);
  assert.match(home, /activePetSceneRect\.height > 0/);
  assert.match(home, /activePetSceneRect\.left \+ activePetSceneRect\.width \/ 2/);
  assert.match(home, /bottom: activePet\.isHatched/);
  assert.match(home, /activePetChromeOffset\.x/);
  assert.match(home, /activePetChromeOffset\.y/);
});
