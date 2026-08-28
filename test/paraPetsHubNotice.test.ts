import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hubPage = readFileSync("client/src/pages/ParaPetsHubPage.tsx", "utf8");

test("the Hub limited-event notice uses the latest uploaded advertisement", () => {
  assert.match(hubPage, /@assets\/uploads\/135C7FD3-0D53-4F08-A8C8-DE9505762C08\.jpeg/);
  assert.doesNotMatch(hubPage, /6CD8FBAA-D30B-4D07-BBD7-493429B3C8C2_1783646983253\.png/);
  assert.match(hubPage, /\{ img: noticeLimited,\s+label: "Limited Event",\s+href: "\/coins" \}/);
});
