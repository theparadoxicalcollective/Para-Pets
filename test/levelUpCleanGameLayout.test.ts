import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");
const route = readFileSync("client/src/pages/PetLevelUpRoute.tsx", "utf8");

test("Level Up has independent top-right close and unboxed game title", () => {
  const close = page.indexOf('data-testid="button-close-levelup-modal"');
  const scroll = page.indexOf('<div className="lupage-scroll">');
  const header = page.indexOf('<header className="lupage-head">');
  assert.ok(close > 0 && close < scroll && scroll < header,
    "close must be independently positioned at page root, never trapped in the title panel");
  assert.match(page, /\.lupage-close\{\s*top:calc\(env\(safe-area-inset-top, 0px\) \+ 18px\)/);
  assert.match(page, /right:clamp\(12px,3vw,28px\);transform:none/);
  assert.match(page, /\.lupage-head\{\s*min-height:0;padding:6px 64px 0;\s*border:0;border-radius:0;background:none;box-shadow:none/);
  assert.match(page, /<h2 className="lupage-title">LEVEL UP<\/h2>/);
  assert.doesNotMatch(page, /className="lupage-sub"/);
});

test("free-use banner and stats hint are removed without touching XP items or pet stats", () => {
  assert.doesNotMatch(page, /No limit — use as many as you like/);
  assert.doesNotMatch(page, /className="lupage-rule"/);
  assert.doesNotMatch(page, /className="lupage-stats-hint"/);
  assert.doesNotMatch(page, /Tap your pet to view ATK/);
  assert.doesNotMatch(route, /subtitle=\{/);
  assert.match(page, /Number\.isFinite\(itemsRemaining\)/,
    "finite use budgets remain visible in the XP tray instead of a separate banner");
  assert.match(page, /aria-label="Show pet stats" aria-expanded=\{showStats\}/);
  assert.match(page, /onKeyDown=\{\(event\) => \{ if \(event\.key === "Enter"/);
  assert.match(page, /data-testid="levelup-pet-stats-popover"/);
  assert.match(page, /onPointerDown=\{\(event\) => onPointerDown\(event, item\)\}/);
  assert.match(page, /onPointerUp=\{onPointerUp\}/);
  assert.match(page, /onUseItem\(item\)/);
});

test("rarity stars are larger and closer to pet while authored positions remain untouched", () => {
  assert.match(page, /\.lupage-stars\{top:24%;/);
  assert.match(page, /\.lupage-stars img\{width:clamp\(40px,11\.5vw,62px\)/);
  assert.match(page, /const curveY = -\(1 - t \* t\) \* 12/);
  assert.match(page, /<PetPageOvalPlacement page="levelUp"/);
  assert.match(page, /data-testid="levelup-active-pet-style-stars"/);
  assert.match(page, /margin-top:clamp\(16px,2\.5vh,28px\)/,
    "compact name and level move farther below the pet");
  assert.match(page, /\.lupage-nameplate>span:first-child\{overflow:hidden/);
});

test("empty XP inventory is compact while available items remain tappable and draggable", () => {
  assert.match(page, /className="lupage-tray" data-empty=\{items\.length === 0\}/);
  assert.match(page, /\.lupage-tray\[data-empty="true"\]\{width:min\(84%,340px\);padding:8px 12px\}/);
  assert.match(page, /content:"XP ITEMS"/);
  assert.match(page, /No XP items in your bag/);
  assert.match(page, /items\.length > 0 && <div className="lupage-hint">Tap or drag XP onto your pet/);
  assert.doesNotMatch(page, /Tap an item or drag it onto \{petName\} to level up/);
  assert.match(page, /\[data-page-presentation="full-viewport"\] \.lupage-tray\[data-empty="true"\]/);
  assert.match(page, /@media\(max-height:740px\)/);
});
