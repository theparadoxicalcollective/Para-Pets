import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");
const modal = readFileSync("client/src/components/ViewportModalPortal.tsx", "utf8");

test("Quest Log owns the full-device modal surface", () => {
  assert.match(nav, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);
  const start = nav.indexOf('data-testid="quest-log-viewport-overlay"');
  const end = nav.indexOf("</ViewportModalPortal>", start);
  assert.ok(start >= 0 && end > start);
  const overlay = nav.slice(start, end);
  assert.match(nav.slice(Math.max(0, start - 180), start), /<ViewportModalPortal>/);
  assert.match(overlay, /className="absolute inset-0 flex items-center justify-center"/);
  assert.match(overlay, /data-testid="quest-log-viewport-backdrop"/);
  assert.match(overlay, /className="absolute inset-0 bg-black\/70 backdrop-blur-sm"/);
});

test("Quest parchment stays intentionally portrait-sized and centered", () => {
  assert.match(nav, /data-testid="quest-log-canonical-scroll"/);
  assert.match(nav, /className="relative w-\[92%\] max-w-\[400px\] scroll-unroll"/);
  assert.match(nav, /<img src=\{questScrollBg\} alt="Quest scroll" className="w-full h-auto block select-none"/);
});

test("Quest behavior remains unchanged by viewport ownership", () => {
  assert.match(nav, /queryKey: \["\/api\/quests\/daily"\]/);
  assert.match(nav, /apiRequest\("POST", `\/api\/quests\/daily\/claim\/\$\{questKey\}`, \{\}\)/);
  assert.match(nav, /setShowQuest\(false\)/);
  assert.match(nav, /visibleDailyQuests\.map/);
  assert.match(nav, /button-begin-journey-claim/);
  assert.match(nav, /button-begin-journey-go/);
});

test("ViewportModalPortal retains native-phone inline fallback", () => {
  assert.match(modal, /if \(!enabled \|\| !target\) return <>\{children\}<\/>/);
});
