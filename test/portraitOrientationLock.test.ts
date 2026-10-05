import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldBlockTouchLandscape } from "../client/src/lib/stage";

const read = (path: string) => readFileSync(path, "utf8");

test("touch-first phones and tablets are blocked only while physically landscape", () => {
  assert.equal(shouldBlockTouchLandscape(390, 844, true, false), false);
  assert.equal(shouldBlockTouchLandscape(430, 932, true, false), false);
  assert.equal(shouldBlockTouchLandscape(844, 390, true, false), true);
  assert.equal(shouldBlockTouchLandscape(1024, 768, true, false), true);
  assert.equal(shouldBlockTouchLandscape(844, 390, false, false), false, "wide desktop is not a rotated phone");
  assert.equal(shouldBlockTouchLandscape(390, 320, true, true), false, "software keyboard must not trigger rotate gate");
});

test("the shared viewport controller owns portrait-lock classification", () => {
  const viewport = read("client/src/lib/stageViewport.ts");

  assert.match(viewport, /const touchFirst = isTouchFirstDevice\(\)/);
  assert.match(viewport, /shouldBlockTouchLandscape\(/);
  assert.match(viewport, /viewport\.keyboardReduced/);
  assert.match(viewport, /touchPortraitBlocked/);
  assert.match(viewport, /window\.addEventListener\("orientationchange", scheduleUpdate\)/);
});

test("game and root stages preserve mounted state behind one unscaled rotate-back blocker", () => {
  const app = read("client/src/App.tsx");
  const root = read("client/src/RootEntry.tsx");
  const blocker = read("client/src/components/PortraitOrientationBlocker.tsx");

  for (const source of [app, root]) {
    assert.match(source, /PortraitOrientationBlocker/);
    assert.match(source, /visible=\{layout\.touchPortraitBlocked\}/);
    assert.match(source, /visibility: layout\.touchPortraitBlocked \? "hidden" : "visible"/);
  }

  assert.match(blocker, /className="fixed inset-0"/);
  assert.match(blocker, /zIndex: 2147483647/);
  assert.match(blocker, /touchAction: "none"/);
  assert.match(blocker, /Rotate to Portrait/);
  assert.match(blocker, /Rotate your phone or tablet back to portrait to continue/);
});

test("installed Para Pets continues requesting portrait-primary from the PWA manifest", () => {
  const manifest = JSON.parse(read("client/public/manifest.json"));
  assert.equal(manifest.orientation, "portrait-primary");
  assert.equal(manifest.display, "standalone");
});

test("portrait lock is capability-based and does not use device or browser names", () => {
  const stage = read("client/src/lib/stage.ts");
  const blocker = read("client/src/components/PortraitOrientationBlocker.tsx");

  assert.match(stage, /if \(!touchFirst \|\| keyboardReduced\) return false/);
  assert.match(stage, /return viewportWidth > viewportHeight/);
  assert.doesNotMatch(stage + blocker, /navigator\.userAgent|iPhone|iPad|Android|Safari|Chrome/);
});
