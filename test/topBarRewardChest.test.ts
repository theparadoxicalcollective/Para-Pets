import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/components/TopBar.tsx", "utf8");

test("reward chest glow is generated from chest alpha instead of the image canvas", () => {
  assert.match(source, /function RewardChestArt/);
  assert.match(source, /<feComponentTransfer in="SourceAlpha" result="chestAlpha">/);
  assert.match(source, /<feGaussianBlur in="chestAlpha"/);
  assert.match(source, /<feMergeNode in="SourceGraphic"/);
  assert.doesNotMatch(
    source,
    /button-gift-rewards-floating[\\s\\S]*?drop-shadow\\(0 0 24px rgba\\(16,185,129,0\\.58\\)\\)/,
  );
});

test("reward count uses a styled gem instead of a plain circular badge", () => {
  assert.match(source, /function RewardCountGem/);
  assert.match(source, /data-testid="reward-count-gem"/);
  assert.match(source, /transform: "rotate\\(45deg\\)"/);
  assert.match(source, /border: "1\\.5px solid rgba\\(244,211,105,0\\.95\\)"/);
  assert.match(source, /linear-gradient\\(145deg, rgba\\(209,250,229,0\\.98\\)/);
});

test("home reward chest is inset from the stage edge using stage-relative units", () => {
  const start = source.indexOf('data-testid="button-gift-rewards-floating"');
  assert.ok(start >= 0);
  const block = source.slice(start, start + 1200);
  assert.match(block, /right: "calc\\(7 \\* var\\(--vw\\)\\)"/);
  assert.doesNotMatch(block, /100vw/);
  assert.ok(block.includes("<RewardChestArt size={70} />"));
  assert.ok(block.includes("<RewardCountGem count={pendingRewards.length} />"));
});

test("reward buttons expose the pending reward count to assistive technology", () => {
  assert.ok(source.includes('aria-label={\`Open \${pendingRewards.length} pending reward\${pendingRewards.length === 1 ? "" : "s"}\`}'));
});
