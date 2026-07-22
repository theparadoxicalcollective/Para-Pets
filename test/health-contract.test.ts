import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Railway health check and server health endpoint remain configured", async () => {
  const [railwayConfig, serverSource] = await Promise.all([
    readFile(new URL("../railway.toml", import.meta.url), "utf8"),
    readFile(new URL("../server/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(railwayConfig, /^healthcheckPath = "\/health"$/m);
  assert.match(serverSource, /app\.get\("\/health", \(_req, res\) => res\.status\(200\)\.json\(\{ status: "ok" \}\)\)/);
});
