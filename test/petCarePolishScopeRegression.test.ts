import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Pet Care polish is bootstrapped without observing Home's animated DOM", () => {
  const main = readFileSync("client/src/main.tsx", "utf8");
  const bootstrap = readFileSync("client/src/petCarePolishBootstrap.ts", "utf8");

  assert.match(main, /installScopedPetCareDragPolish/);
  assert.doesNotMatch(main, /import \{ installPetCareDragPolish \} from "\.\/petCarePolish"/);
  assert.match(bootstrap, /target === document\.documentElement/);
  assert.match(bootstrap, /quantityObserver = this/);
  assert.match(bootstrap, /originalObserve\.call\(quantityObserver, nextOverlay/);
  assert.match(bootstrap, /document\.querySelector<HTMLElement>\(PET_CARE_OVERLAY_SELECTOR\)/);
  assert.match(bootstrap, /observedOverlay\?\.isConnected/);
  assert.match(bootstrap, /quantityObserver\?\.disconnect\(\)/);
});

test("Pet Care observer scope preserves the existing interaction implementation", () => {
  const bootstrap = readFileSync("client/src/petCarePolishBootstrap.ts", "utf8");
  const polish = readFileSync("client/src/petCarePolish.ts", "utf8");

  assert.match(bootstrap, /installPetCareDragPolish\(\)/);
  assert.match(polish, /createRenderedDragGhost/);
  assert.match(polish, /createDropSparkles/);
  assert.match(polish, /dispatchPettingAssist/);
  assert.match(polish, /syncStackQuantityBadges/);
});
