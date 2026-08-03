import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Pet Care layout polish stays route-scoped", () => {
  const main = readFileSync("client/src/main.tsx", "utf8");
  const css = readFileSync("client/src/petCarePolish.css", "utf8");

  assert.match(main, /import "\.\/petCarePolish\.css";/);
  assert.match(main, /installPetCareDragPolish\(\);/);
  assert.match(css, /\.pet-care-overlay \.pet-care-loyalty[\s\S]*?left: clamp\(4px/);
  assert.match(css, /\.pet-care-overlay \.pet-care-meter--vertical \.pet-care-meter__track[\s\S]*?width: 19%/);
  assert.match(css, /\.pet-care-overlay \.pet-care-mood \.pet-care-meter[\s\S]*?width: min\(72%, 380px\)/);
  assert.match(css, /\.pet-care-overlay \.pet-care-inventory-section \.pet-care-hunger[\s\S]*?360px[\s\S]*?translateY\(-7px\)/);
});

test("Pet Care drags the original shelf artwork above the UI", () => {
  const drag = readFileSync("client/src/petCarePolish.ts", "utf8");
  const css = readFileSync("client/src/petCarePolish.css", "utf8");

  assert.match(drag, /querySelector<HTMLElement>\("\.pet-care-item-shelf__visible-artwork"\)/);
  assert.match(drag, /document\.body\.appendChild\(drag\.artwork\)/);
  assert.match(drag, /requestAnimationFrame/);
  assert.match(drag, /translate3d/);
  assert.match(drag, /Horizontal movement belongs to the shelf's native scroller/);
  assert.match(drag, /drag\.marker\.parentNode\.insertBefore\(drag\.artwork, drag\.marker\)/);
  assert.match(css, /\.pet-care-native-drag-artwork[\s\S]*?z-index: 10050/);
  assert.match(css, /body\.pet-care-native-item-dragging \.pet-care-drag-ghost__image[\s\S]*?visibility: hidden/);
});
