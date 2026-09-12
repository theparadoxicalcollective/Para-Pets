import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeSource = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const navSource = readFileSync("client/src/components/FloatingNav.tsx", "utf8");
const friendsSource = readFileSync("client/src/pages/FriendsPage.tsx", "utf8");

test("friend requests do not participate in the Active Pet page layout", () => {
  assert.doesNotMatch(homeSource, /section-friend-requests/);
  assert.doesNotMatch(homeSource, /sent you a friend request/);
  assert.doesNotMatch(homeSource, /pendingRequests/);
});

test("the collapsed floating navigation shows a non-layout badge for pending requests", () => {
  assert.match(navSource, /data-testid="badge-friend-request-count"/);
  assert.match(navSource, /friendRequestCount > 0 && !isOpen/);
  assert.match(navSource, /position: "absolute"/);
  assert.match(navSource, /pointerEvents: "none"/);
});

test("the Friends page opens its request drawer when pending requests arrive", () => {
  assert.match(friendsSource, /if \(friendRequests\.length > 0\) setShowRequests\(true\)/);
  assert.match(friendsSource, /\[friendRequests\.length\]/);
  assert.match(friendsSource, /data-testid="button-toggle-requests"/);
});
