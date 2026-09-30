import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const friendsRoutes = readFileSync("server/routes/friends.routes.ts", "utf8");

const expected = [
  "POST /api/friends/request/:targetUserId",
  "GET /api/friends/requests",
  "GET /api/friends/requests/count",
  "POST /api/friends/accept/:requestId",
  "GET /api/notifications/unread",
  "POST /api/notifications/mark-read",
  "DELETE /api/friends/:otherId",
  "GET /api/friends",
  "GET /api/friends/status/:otherId",
].sort();

function socialEndpoints(source: string): string[] {
  return Array.from(source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g))
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`)
    .filter((route) => route.includes("/api/friends") || route.includes("/api/notifications"))
    .sort();
}

test("friends and notification routes are isolated and registered exactly once", () => {
  assert.match(
    legacyRoutes,
    /import \{ registerFriendsRoutes \} from "\.\/routes\/friends\.routes"/,
  );
  assert.match(
    legacyRoutes,
    /registerFriendsRoutes\(app, \{ storage, isAuthenticated \}\)/,
  );
  assert.deepEqual(socialEndpoints(friendsRoutes), expected);
  assert.deepEqual(socialEndpoints(legacyRoutes), []);
});

test("all friends and notification endpoints remain authenticated", () => {
  const registrations = Array.from(
    friendsRoutes.matchAll(
      /app\.(get|post|delete)\(\s*["'`]\/api\/(?:friends|notifications)[^"'`]*["'`]\s*,\s*isAuthenticated/g,
    ),
  );
  assert.equal(registrations.length, expected.length);
});

test("friend-request anti-spam and self-request rules remain unchanged", () => {
  assert.match(friendsRoutes, /requesterId === targetUserId/);
  assert.match(friendsRoutes, /getOutgoingPendingRequestCount\(requesterId\)/);
  assert.match(friendsRoutes, /outgoingCount >= 25/);
  assert.match(friendsRoutes, /limit of 25 unanswered friend requests/);
});

test("friend acceptance preserves both 100-friend caps and rollback", () => {
  assert.match(friendsRoutes, /receiverFriends\.length >= 100/);
  assert.match(friendsRoutes, /You have reached the 100-friend limit/);
  assert.match(friendsRoutes, /requesterFriends\.length > 100/);
  assert.match(friendsRoutes, /removeFriendOrRequest\(userId, result\.requesterId\)/);
  assert.match(friendsRoutes, /The other player has reached the 100-friend limit/);
});

test("friend request and acceptance notifications remain unchanged", () => {
  assert.match(friendsRoutes, /"friend_request"/);
  assert.match(friendsRoutes, /sent you a friend request!/);
  assert.match(friendsRoutes, /"friend_accepted"/);
  assert.match(friendsRoutes, /accepted your friend request!/);
});

test("friend removal, lists, status, and unread notification behavior remain unchanged", () => {
  assert.match(friendsRoutes, /getPendingFriendRequests\(userId\)/);
  assert.match(friendsRoutes, /getPendingFriendRequestCount\(userId\)/);
  assert.match(friendsRoutes, /getUnreadNotifications\(userId\)/);
  assert.match(friendsRoutes, /markNotificationsRead\(userId\)/);
  assert.match(friendsRoutes, /removeFriendOrRequest\(userId, otherId\)/);
  assert.match(friendsRoutes, /getFriends\(userId\)/);
  assert.match(friendsRoutes, /getFriendshipStatus\(userId, otherId\)/);
});
