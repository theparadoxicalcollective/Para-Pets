import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/components/TopBar.tsx", "utf8");

test("reward chest glow is generated from chest alpha instead of the image canvas", () => {
  assert.ok(source.includes("function RewardChestArt"));
  assert.ok(source.includes('<feComponentTransfer in="SourceAlpha" result="chestAlpha">'));
  assert.ok(source.includes('<feGaussianBlur in="chestAlpha"'));
  assert.ok(source.includes('<feMergeNode in="SourceGraphic"'));

  const start = source.indexOf('data-testid="button-gift-rewards-floating"');
  assert.ok(start >= 0);
  const block = source.slice(start, start + 1800);
  assert.ok(!block.includes("drop-shadow(0 0 24px rgba(16,185,129,0.58))"));
});

test("reward count uses a styled gem instead of a plain circular badge", () => {
  assert.ok(source.includes("function RewardCountGem"));
  assert.ok(source.includes('data-testid="reward-count-gem"'));
  assert.ok(source.includes('transform: "rotate(45deg)"'));
  assert.ok(source.includes('border: "1.5px solid rgba(244,211,105,0.95)"'));
  assert.ok(source.includes("linear-gradient(145deg, rgba(209,250,229,0.98)"));
});

test("home reward chest is inset from the stage edge using stage-relative units", () => {
  const start = source.indexOf('data-testid="button-gift-rewards-floating"');
  assert.ok(start >= 0);
  const block = source.slice(start, start + 1800);
  assert.ok(block.includes('right: "calc(7 * var(--vw))"'));
  assert.ok(!block.includes("100vw"));
  assert.ok(block.includes("<RewardChestArt size={70} />"));
  assert.ok(block.includes("<RewardCountGem count={pendingRewards.length} />"));
});

test("reward buttons expose the pending reward count to assistive technology", () => {
  assert.ok(source.includes("pending reward"));
  assert.ok(source.includes("pendingRewards.length === 1"));
});
