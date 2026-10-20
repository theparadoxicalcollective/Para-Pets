import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("client/src/pages/CoinShopPage.tsx", "utf8");

test("limited egg previews reserve normal-flow space above unobstructed prices", () => {
  assert.ok(source.includes("bonus?.eggUrl && ("));
  assert.ok(source.includes("coin-shop-limited-egg"));
  assert.ok(source.includes('width: "min(100%, 92px)"'));
  const egg = source.slice(source.indexOf('data-testid={`limited-egg-spotlight-'), source.indexOf('data-testid={`pack-price-'));
  assert.match(egg, /position: "relative"/);
  assert.doesNotMatch(egg, /position: "absolute"|bottom: -22|right: -12/);
  assert.ok(source.includes('pointerEvents: "none"'));
});

test("sparkle effect is decorative and respects reduced motion", () => {
  assert.ok(source.includes("<style>{limitedEggStyles}</style>"));
  assert.ok(source.includes("@keyframes coinShopEggTwinkle"));
  assert.ok(source.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(source.includes('aria-hidden="true"'));
});
