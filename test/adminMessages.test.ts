import assert from "node:assert/strict";
import test from "node:test";
import { deleteOwnedAdminMessage } from "../server/adminMessages";

test("players can delete only their own admin messages", async () => {
  const calls: Array<[string, string]> = [];
  const handler = deleteOwnedAdminMessage(async (id, username) => {
    calls.push([id, username]);
    return username === "owner";
  });
  const result = { statusCode: 200, body: undefined as unknown };
  const res = { status(code: number) { result.statusCode = code; return this; }, json(body: unknown) { result.body = body; return this; } };

  await handler({ params: { id: "message-1" }, user: { username: "owner" } } as any, res as any, (() => {}) as any);
  assert.deepEqual(calls, [["message-1", "owner"]]);
  assert.deepEqual(result, { statusCode: 200, body: { message: "Deleted" } });

  await handler({ params: { id: "message-1" }, user: { username: "other-player" } } as any, res as any, (() => {}) as any);
  assert.equal(result.statusCode, 404);
  assert.deepEqual(result.body, { message: "Message not found" });
});
