import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("ordinary fish offer an eyes layer in the existing parts editor", () => {
  const admin = readFileSync("client/src/components/FishingAdminPanel.tsx", "utf8");
  const normal = admin.split("const FISH_PART_TYPES_NORMAL = [")[1].split("] as const")[0];
  assert.ok(normal.includes('key: "eyes_open"'));
});

test("aquarium layers fish eyes over the head and reuses blink animation", () => {
  const page = readFileSync("client/src/pages/AquariumPage.tsx", "utf8");
  const css = readFileSync("client/src/index.css", "utf8");
  assert.ok(page.includes("head: 8, eyes_open: 9"));
  assert.ok(page.includes('eyes_open:      { anim: "fishBlink"'));
  assert.ok(page.includes('part.partType === "eyes_open" ? "" : " alternate"'));
  assert.ok(css.includes("@keyframes fishBlink"));
});
