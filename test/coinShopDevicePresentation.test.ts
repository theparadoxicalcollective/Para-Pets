import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const coinShop = readFileSync("client/src/pages/CoinShopPage.tsx", "utf8");

test("Coin Shop keeps its authored page on the canonical player stage", () => {
  assert.match(coinShop, /data-stage-coordinate-space="canonical"/);
  assert.match(coinShop, /position: "absolute", inset: 0, pointerEvents: "auto", overflowY: "auto"/);
});

test("Coin Shop extends its existing atmosphere into the larger device backdrop", () => {
  assert.match(coinShop, /import ViewportBackdropPortal from "@\/components\/ViewportBackdropPortal"/);
  assert.match(coinShop, /<ViewportBackdropPortal>/);
  assert.match(coinShop, /data-testid="coin-shop-viewport-backdrop"/);
  assert.match(coinShop, /linear-gradient\(180deg, #040d04 0%, #071a0a 15%, #0d2510 40%/);
});

test("all Coin Shop blocking overlays use the shared viewport modal surface", () => {
  assert.match(coinShop, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);
  assert.equal((coinShop.match(/<ViewportModalPortal>/g) ?? []).length, 5);
  assert.equal((coinShop.match(/<\/ViewportModalPortal>/g) ?? []).length, 5);
  assert.doesNotMatch(coinShop, /position: "fixed"/);

  assert.match(coinShop, /milestonePopup !== null[\s\S]*?<ViewportModalPortal>/);
  assert.match(coinShop, /adminPickerMs !== null[\s\S]*?<ViewportModalPortal>/);
  assert.match(coinShop, /showSupport && \([\s\S]*?<ViewportModalPortal>/);
  assert.match(coinShop, /verifying && successCoins === null && \([\s\S]*?<ViewportModalPortal>/);
  assert.match(coinShop, /successCoins !== null && \([\s\S]*?<ViewportModalPortal>/);
});

test("Stripe verification keeps its existing escape hatch and payment recovery behavior", () => {
  assert.match(coinShop, /data-testid="button-skip-verify"/);
  assert.match(coinShop, /data-ios-edge-control="true"/);
  assert.match(coinShop, /pendingPurchaseSession/);
  assert.match(coinShop, /clearPendingPurchase/);
  assert.match(coinShop, /for \(const key of PURCHASE_QUERY_KEYS\)/);
  assert.match(coinShop, /apiRequest\("POST", "\/api\/coins\/verify"/);
  assert.match(coinShop, /apiRequest\("POST", "\/api\/coins\/checkout", \{ packId \}\)/);
});

test("Coin Shop milestone and support actions remain unchanged", () => {
  assert.match(coinShop, /apiRequest\("POST", "\/api\/coins\/claim-milestone", \{ milestoneId: String\(milestone\) \}\)/);
  assert.match(coinShop, /apiRequest\("PATCH", `\/api\/admin\/milestone-rewards\/\$\{ms\}`/);
  assert.match(coinShop, /apiRequest\("POST", "\/api\/support-message"/);
  assert.match(coinShop, /maxHeight: "calc\(80\*var\(--vh\)\)"/);
});
