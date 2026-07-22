import assert from "node:assert/strict";
import test from "node:test";
import { deleteOwnedAdminMessage } from "../server/adminMessages";
import { newAccountPrivileges } from "../server/registration";

test("registration defaults never grant administrator or moderator privileges", () => {
  assert.deepEqual(newAccountPrivileges(), { isAdmin: false, isModerator: false });
});

test("message deletion delegates the recipient identity to the owner-scoped storage operation", async () => {
  const calls: Array<[string, string]> = [];
  const deleted = await deleteOwnedAdminMessage(async (messageId, username) => {
    calls.push([messageId, username]);
    return false;
  }, "message-owned-by-someone-else", "player-one");

  assert.equal(deleted, false);
  assert.deepEqual(calls, [["message-owned-by-someone-else", "player-one"]]);
});
