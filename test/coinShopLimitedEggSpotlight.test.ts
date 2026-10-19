import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("client/src/pages/CoinShopPage.tsx", "utf8");

test("only limited bundles display larger responsive egg previews", () => {
  assert.ok(source.includes("bonus?.eggUrl && ("));
  assert.ok(source.includes("coin-shop-limited-egg"));
  assert.ok(source.includes('width: "clamp(84px, 28vw, 110px)"'));
  assert.ok(source.includes('pointerEvents: "none"'));
});

test("sparkle effect is decorative and respects reduced motion", () => {
  assert.ok(source.includes("<style>{limitedEggStyles}</style>"));
  assert.ok(source.includes("@keyframes coinShopEggTwinkle"));
  assert.ok(source.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(source.includes('aria-hidden="true"'));
});
