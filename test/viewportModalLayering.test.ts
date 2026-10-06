import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("stage-owned devices mount blocking modals above the persistent HUD", () => {
  const app = read("client/src/App.tsx");

  const hud = app.indexOf('id="game-viewport-hud"');
  const modal = app.indexOf('id="game-viewport-modal"', hud);

  assert.ok(hud >= 0);
  assert.ok(modal > hud);

  const modalBlock = app.slice(modal, modal + 700);
  assert.match(modalBlock, /left: hudRect\.left/);
  assert.match(modalBlock, /top: hudRect\.top/);
  assert.match(modalBlock, /width: hudRect\.width/);
  assert.match(modalBlock, /height: hudRect\.height/);
  assert.match(modalBlock, /pointerEvents: "none"/);
});

test("modal portal falls back inline on the native iPhone 12 path", () => {
  const portal = read("client/src/components/ViewportModalPortal.tsx");

  assert.match(portal, /const VIEWPORT_MODAL_ID = "game-viewport-modal"/);
  assert.match(portal, /if \(!target\) return <>\{children\}<\/>/);
  assert.match(portal, /createPortal/);
  assert.match(portal, /data-testid="viewport-modal-portal"/);
});

test("Pet Home bundle confirmation owns the modal layer above inventory icons", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");

  assert.match(owner, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);

  const hud = owner.indexOf('data-testid="pet-home-inventory-hud"');
  const modalStart = owner.indexOf("<ViewportModalPortal>", hud);
  const cancel = owner.indexOf('data-testid="button-cancel-activate"', modalStart);
  const confirm = owner.indexOf('data-testid="button-confirm-activate"', modalStart);
  const modalEnd = owner.indexOf("</ViewportModalPortal>", modalStart);

  assert.ok(hud >= 0);
  assert.ok(modalStart > hud);
  assert.ok(cancel > modalStart && cancel < modalEnd);
  assert.ok(confirm > modalStart && confirm < modalEnd);
  assert.match(owner, /pointerEvents: pendingActivate \|\| openGiftModal \|\| showNoMailPopup \? "none" : "auto"/);
  assert.match(owner, /opacity: pendingActivate \|\| openGiftModal \|\| showNoMailPopup \? 0\.28 : 1/);
});

test("Pet Home gift and no-mail blocking surfaces also use the modal layer", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");

  const gift = owner.indexOf("{openGiftModal && (");
  const giftPortal = owner.indexOf("<ViewportModalPortal>", gift);
  const giftEnd = owner.indexOf("</ViewportModalPortal>", giftPortal);
  assert.ok(gift >= 0 && giftPortal > gift && giftEnd > giftPortal);

  const noMail = owner.indexOf("{showNoMailPopup && (");
  const noMailPortal = owner.indexOf("<ViewportModalPortal>", noMail);
  const noMailClose = owner.indexOf('data-testid="button-close-no-mail"', noMailPortal);
  const noMailEnd = owner.indexOf("</ViewportModalPortal>", noMailPortal);
  assert.ok(noMail >= 0 && noMailPortal > noMail);
  assert.ok(noMailClose > noMailPortal && noMailClose < noMailEnd);
});

test("Active Pet support modal is above its device HUD controls", () => {
  const home = read("client/src/pages/HomePage.tsx");

  const support = home.indexOf("{showSupportModal && (");
  const portal = home.indexOf("<ViewportModalPortal>", support);
  const close = home.indexOf('data-testid="button-close-support-modal"', portal);
  const end = home.indexOf("</ViewportModalPortal>", portal);

  assert.ok(support >= 0 && portal > support);
  assert.ok(close > portal && close < end);
});
