import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Lava Crawl removes the same keyboard listeners that it registers", async () => {
  const source = await readFile("client/src/pages/LavaCrawlPage.tsx", "utf8");

  assert.match(source, /addEventListener\("keydown", onKeyDown\)/);
  assert.match(source, /removeEventListener\("keydown", onKeyDown\)/);
  assert.match(source, /addEventListener\("keyup", onKeyUp\)/);
  assert.match(source, /removeEventListener\("keyup", onKeyUp\)/);
  assert.doesNotMatch(source, /removeEventListener\("key(?:down|up)",\s*e\s*=>/);
});
