import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { getBuildInfo, registerBuildInfoRoute } from "../server/buildInfo";
import { serveStatic } from "../server/static";

async function withServer(app: express.Express, run: (origin: string) => Promise<void>) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("production HTML entrypoints and SPA fallbacks cannot be cached", async () => {
  const publicPath = mkdtempSync(path.join(tmpdir(), "para-pets-static-"));
  writeFileSync(path.join(publicPath, "index.html"), "<!doctype html><title>Para Pets</title>");
  mkdirSync(path.join(publicPath, "assets"));
  writeFileSync(path.join(publicPath, "assets", "app-a1b2c3.js"), "console.log('ok')");
  const app = express();
  serveStatic(app, publicPath);

  await withServer(app, async (origin) => {
    for (const route of ["/", "/hub", "/pets/example"]) {
      const response = await fetch(origin + route);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-cache, no-store, must-revalidate", route);
      assert.match(response.headers.get("content-type") ?? "", /text\/html/, route);
    }
    const asset = await fetch(origin + "/assets/app-a1b2c3.js");
    assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  });
});

test("build info exposes only the documented deployment fields", async () => {
  const expected = {
    shortCommitSha: "b55bfe0",
    fullCommitSha: "b55bfe01e306ba55ab989f7d119a68f79c9e9f3a",
    buildTimestamp: "2026-08-02T12:00:00.000Z",
    environment: "production",
    branch: "main",
  };
  assert.deepEqual(getBuildInfo({
    BUILD_COMMIT_SHA: expected.fullCommitSha,
    BUILD_TIMESTAMP: expected.buildTimestamp,
    BUILD_ENVIRONMENT: expected.environment,
    BUILD_BRANCH: expected.branch,
    SECRET_THAT_MUST_NOT_LEAK: "hidden",
  }), expected);

  const app = express();
  registerBuildInfoRoute(app);
  await withServer(app, async (origin) => {
    const response = await fetch(origin + "/api/build-info");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["branch", "buildTimestamp", "environment", "fullCommitSha", "shortCommitSha"]);
  });
});

