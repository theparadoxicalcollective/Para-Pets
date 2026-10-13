import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");

test("all gameplay page surfaces explicitly use native viewport mode", () => {
  const tags = [...app.matchAll(/<StagePageSurface\b[^>]*>/g)].map(match => match[0]);
  assert.ok(tags.length > 0);
  for (const tag of tags) assert.match(tag, /layout="viewport"/);
});

test("shared gameplay page surface never creates a 390x844 reference wrapper", () => {
  assert.doesNotMatch(surface, /data-stage-reference-plane|stage-page-reference-plane|--stage-reference-left|--stage-reference-width/);
  assert.doesNotMatch(surface, /layout\s*=\s*"reference"|layout\?:\s*"reference"/);
  assert.match(surface, /data-page-presentation="full-viewport"/);
  assert.match(surface, /createPortal\(content, target\)/);
  assert.match(surface, /--viewport-surface-height/);
});
