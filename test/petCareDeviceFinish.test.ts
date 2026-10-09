import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Pet Care expands only its environment while keeping interaction coordinates canonical", () => {
  const source = read("client/src/features/pet-care/FeedingOverlay.tsx");

  assert.match(source, /<ViewportScenePortal interactive=\{false\}>/);
  assert.match(source, /data-testid="pet-care-viewport-environment"/);
  assert.match(source, /backgroundSize: "cover"/);
  assert.match(source, /useStageSurroundings\(\{/);
  assert.match(source, /imageUrl: feedingPageBg/);
  assert.match(source, /className=\{`absolute inset-0 h-full w-full pet-care-overlay/);
  assert.match(source, /data-stage-coordinate-space=\{viewportCareSurface\(\) \? "viewport" : "canonical"\}/);
  assert.doesNotMatch(source, /className=\{`fixed inset-0 pet-care-overlay/);
  assert.doesNotMatch(source, /maxWidth: "768px", margin: "0 auto", left: 0, right: 0/);
});

test("Pet Care item drag and reward effects retain shared stage conversions", () => {
  const source = read("client/src/features/pet-care/FeedingOverlay.tsx");

  assert.match(source, /dragPositionRef\.current = clientToStagePortal\(x, y\)/);
  assert.match(source, /createPortal\([\s\S]*?pet-care-drag-ghost[\s\S]*?getStagePortalTarget\(\)/);
  assert.match(source, /clientToStage\(/);
  assert.match(source, /clientRectPointToStage/);
  assert.match(source, /position="fixed"/);
});

test("presentation-only viewport scene does not intercept Pet Care input", () => {
  const portal = read("client/src/components/ViewportScenePortal.tsx");

  assert.match(portal, /interactive = true/);
  assert.match(portal, /interactive\?: boolean/);
  assert.match(portal, /pointerEvents: viewportPointerEvents\(interactive \? "interactive" : "decorative"\)/);
});

test("Pet Care keeps the same original background in both the canonical scene and device extension", () => {
  const source = read("client/src/features/pet-care/FeedingOverlay.tsx");

  assert.match(source, /@assets\/IMG_5734_1783098320823\.jpeg/);
  const matches = source.match(/url\(\$\{feedingPageBg\}\)/g) ?? [];
  assert.ok(matches.length >= 2, "same Pet Care art should back both canonical and expanded environment");
  assert.doesNotMatch(source, /backgroundSize:\s*"100% 100%"/);
});

test("iPhone 12 still uses the inline Pet Care scene path", () => {
  const portal = read("client/src/components/ViewportScenePortal.tsx");
  const stage = read("client/src/lib/stage.ts");

  assert.match(portal, /if \(!enabled \|\| !target\) return <>\{children\}<\/?>/);
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(stage, /viewportOwned: true/);
});
