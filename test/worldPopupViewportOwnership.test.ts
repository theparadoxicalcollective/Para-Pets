import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const shop = read("client/src/components/world/WorldShopOverlay.tsx");
const cauldron = read("client/src/components/world/MixingTreeCauldron.tsx");
const recipes = read("client/src/components/world/MixingTreeRecipes.tsx");
const portal = read("client/src/components/ViewportModalPortal.tsx");

test("world shop uses the shared full-device modal surface", () => {
  assert.match(shop, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);
  assert.match(shop, /<ViewportModalPortal>[\s\S]*data-testid="world-shop-viewport-modal"/);
  assert.doesNotMatch(
    shop,
    /data-global-hud-blocker="true" className="fixed inset-0 z-40 flex flex-col" style=\{\{ maxWidth: "768px"/,
  );

  // Existing shop behavior remains wired through the overlay.
  assert.match(shop, /onPurchase\(itemId, 1\)/);
  assert.match(shop, /onBuyBundle/);
  assert.match(shop, /data-testid="button-close-shop"/);
  assert.match(shop, /data-testid="button-sell-items"/);
});

test("Mixing Tree blocking recipe dialogs use the viewport modal surface", () => {
  assert.match(recipes, /function MixingTreeModalSurface/);
  assert.match(recipes, /<ViewportModalPortal>/);
  assert.equal((recipes.match(/<MixingTreeModalSurface>/g) ?? []).length, 3);
  assert.doesNotMatch(recipes, /maxWidth: "768px", margin: "0 auto", left: 0, right: 0/);

  assert.match(recipes, /data-testid="button-close-recipe-book"/);
  assert.match(recipes, /data-testid="button-close-already-unlocked"/);
});

test("cauldron result dialogs use the viewport while drag UI stays stage-aligned", () => {
  assert.match(cauldron, /data-testid="mixing-tree-brew-error-modal"/);
  assert.match(cauldron, /data-testid="mixing-tree-brew-result-modal"/);
  assert.equal((cauldron.match(/<ViewportModalPortal>/g) ?? []).length, 2);

  // The interactive ingredient tray and touch ghost intentionally stay in the
  // gameplay coordinate plane so drops still line up with the authored cauldron.
  assert.match(cauldron, /className="fixed z-\[60\] bottom-0 left-0 right-0 pointer-events-none"/);
  assert.match(cauldron, /const rect = zone\.getBoundingClientRect\(\)/);
  assert.match(cauldron, /touch\.clientX >= rect\.left/);
  assert.match(cauldron, /touch\.clientY >= rect\.top/);
});

test("viewport modal portal keeps native phone fallback and wide-device HUD ownership", () => {
  assert.match(portal, /document\.getElementById\(VIEWPORT_HUD_ID\)/);
  assert.match(portal, /if \(!enabled \|\| !target\) return <>\{children\}<\/>;/);
  assert.match(portal, /zIndex: VIEWPORT_LAYER_Z\.modal/);
});
