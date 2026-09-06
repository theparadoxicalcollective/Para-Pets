import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../client/src/components/GinnyGuideAlignmentFix.tsx"), "utf8");

test("the alignment correction explicitly leaves Open The Closet on the original layout", () => {
  assert.match(source, /label === "Open The Closet"/);
  assert.match(source, /copy\.style\.padding = "9px 12px"/);
  assert.match(source, /arrow\.textContent = "↓"/);
});
