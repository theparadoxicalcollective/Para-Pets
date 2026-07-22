import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { registerHealthRoute } from "../server/health";

test("the health endpoint provides Railway's database-free deployment contract", async () => {
  const app = express();
  registerHealthRoute(app);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.notEqual(address, null);
    const response = await fetch(`http://127.0.0.1:${(address as any).port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
