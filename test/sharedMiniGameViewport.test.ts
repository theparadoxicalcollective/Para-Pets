import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("shared MiniGameFrame expands through the proven viewport scene without adding a second scaler", () => {
  const frame = read("client/src/components/world/MiniGameFrame.tsx");

  assert.match(frame, /import ViewportScenePortal/);
  assert.match(frame, /<ViewportScenePortal>/);
  assert.match(frame, /data-testid="mini-game-frame"/);
  assert.match(frame, /data-camera-mode="device-viewport"/);
  assert.match(frame, /backgroundSize: "cover"/);
  assert.match(frame, /backgroundPosition: "center"/);
  assert.match(frame, /pointerEvents: "auto"/);

  assert.doesNotMatch(frame, /ResizeObserver/);
  assert.doesNotMatch(frame, /transform:\s*`?scale/);
  assert.doesNotMatch(frame, /window\.innerWidth|window\.innerHeight|visualViewport/);
});

test("world artwork can fill newly revealed mini-game camera space without stretching the locked page", () => {
  const frame = read("client/src/components/world/MiniGameFrame.tsx");

  assert.match(frame, /background: artwork \? "transparent" : "#09050d"/);
  assert.match(frame, /width: "100%"/);
  assert.match(frame, /height: "100%"/);
  assert.doesNotMatch(frame, /backgroundSize:\s*"100% 100%"/);
});

test("Molten Blocks and Lava Crawl continue using the shared MiniGameFrame", () => {
  const app = read("client/src/App.tsx");

  assert.match(app, /<MiniGameFrame worldId="volcanic"><MoltenBlocksPage \/><\/MiniGameFrame>/);
  assert.match(app, /<MiniGameFrame worldId="volcanic"><LavaCrawlPage \/><\/MiniGameFrame>/);
});

test("Bingo and Slots continue using the shared MiniGameFrame", () => {
  const casino = read("client/src/components/world/HauntedCasinoRuntime.tsx");

  assert.match(casino, /<MiniGameFrame worldId="haunted_woods">[\s\S]*?<HauntedBingoOverlay/);
  assert.match(casino, /<MiniGameFrame worldId="haunted_woods">[\s\S]*?<SlaughterSlotsOverlay/);
});

test("casino opening-soon modal stays inside the shared game portal rather than document.body", () => {
  const casino = read("client/src/components/world/HauntedCasinoRuntime.tsx");

  const modalStart = casino.indexOf("{openingSoon && createPortal(");
  const bingoStart = casino.indexOf("{bingoOpen && createPortal(", modalStart);
  assert.ok(modalStart >= 0 && bingoStart > modalStart);

  const modalBlock = casino.slice(modalStart, bingoStart);
  assert.match(modalBlock, /getStagePortalTarget\(\)/);
  assert.doesNotMatch(modalBlock, /document\.body/);
});

test("native iPhone path remains inline through ViewportScenePortal fallback", () => {
  const portal = read("client/src/components/ViewportScenePortal.tsx");
  const stage = read("client/src/lib/stage.ts");

  assert.match(portal, /if \(!enabled \|\| !target\) return <>\{children\}<\/?>/);
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(stage, /viewportOwned: true/);
});
