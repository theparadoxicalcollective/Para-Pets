import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("viewport modal portal renders above persistent HUD chrome", () => {
  const portal = read("client/src/components/ViewportModalPortal.tsx");

  assert.match(portal, /const VIEWPORT_HUD_ID = "game-viewport-hud"/);
  assert.match(portal, /document\.getElementById\(VIEWPORT_HUD_ID\)/);
  assert.match(portal, /position: "absolute"/);
  assert.match(portal, /inset: 0/);
  assert.match(portal, /zIndex: 20000/);
  assert.match(portal, /pointerEvents: "auto"/);
  assert.match(portal, /createPortal/);
});

test("Pet Home blocking dialogs use the modal portal while inventory uses the HUD portal", () => {
  const home = read("client/src/pages/PetHousePage.tsx");
  const gift = read("client/src/components/GiftClaimModal.tsx");
  const sendGift = read("client/src/components/SendGiftModal.tsx");
  const activePet = read("client/src/pages/HomePage.tsx");

  assert.match(home, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);
  assert.match(home, /\{openInventory && \([\s\S]*?<ViewportHudPortal>/);
  assert.match(home, /data-testid="bundle-activation-modal"/);
  assert.match(home, /data-testid="no-mail-modal"/);
  assert.match(home, /<ViewportModalPortal>/);

  assert.match(gift, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);
  assert.match(gift, /<ViewportModalPortal>/);
  assert.match(gift, /data-testid="gift-claim-modal"/);
  assert.match(gift, /aria-modal="true"/);

  assert.match(sendGift, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);
  assert.equal((sendGift.match(/<ViewportModalPortal>/g) ?? []).length, 3);
  assert.match(sendGift, /data-testid="send-gift-modal"/);
  assert.match(sendGift, /data-testid="send-gift-confirm"/);
  assert.match(sendGift, /data-testid="send-gift-success"/);

  assert.match(activePet, /\{showSupportModal && \([\s\S]*?<ViewportModalPortal>/);
  assert.match(activePet, /data-testid="button-close-support-modal"/);
});

test("Active Pet no longer registers a second shell-surroundings background", () => {
  const home = read("client/src/pages/HomePage.tsx");
  assert.match(home, /<ViewportBackdropPortal>/);
  assert.doesNotMatch(home, /useStageSurroundings/);
});
