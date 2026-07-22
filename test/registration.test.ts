import assert from "node:assert/strict";
import test from "node:test";
import { createRegisteredUser } from "../server/registration";

test("new registrations never receive administrator or moderator privileges", () => {
  const user = createRegisteredUser({
    username: "new_player",
    email: "player@example.com",
    password: "hashed-password",
    profileImage: null,
  });

  assert.equal(user.isAdmin, false);
  assert.equal(user.isModerator, false);
});
