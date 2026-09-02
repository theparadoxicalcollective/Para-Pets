import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { replaceAuthSession } from "../client/src/lib/authSession";

test("late auth responses cannot undo signup or restore a signed-out session", async () => {
  for (const nextUser of [{ id: "new-player" }, null]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolve!: (user: unknown) => void;
    const pending = client.fetchQuery({ queryKey: ["/api/auth/me"], queryFn: () => new Promise(done => { resolve = done; }) }).catch(() => {});
    client.setQueryData(["/api/inventory"], [{ owner: "old-player" }]);
    await replaceAuthSession(nextUser, client);
    resolve({ id: "old-player" });
    await pending;
    await new Promise(setImmediate);
    assert.deepEqual(client.getQueryData(["/api/auth/me"]), nextUser);
    assert.equal(client.getQueryData(["/api/inventory"]), undefined);
    client.clear();
  }
});
