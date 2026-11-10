import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("Home isolates transient account state until the new authenticated account is current", () => {
  assert.match(home, /setCurrentUser\(prev => prev\.id === user\.id \? \{ \.\.\.prev, \.\.\.user \} : user\)/);
  assert.match(home, /\[user\.id, user\.activePetId, user\.coins, user\.profileImage, user\.username\]/);
  assert.match(home, /if \(currentUser\.id !== user\.id\) return null/);
  assert.match(home, /watcherSeenIdsRef\.current = null/);
  assert.match(home, /setWatcherAnnouncement\(null\)/);
  assert.match(home, /localStorage\.getItem\(\`para-pets:watcher-bubble-muted:/);
  assert.match(home, /setShowWorldChat\(false\)/);
  assert.match(home, /setShowProfile\(false\)/);
  assert.match(home, /setShowSupportModal\(false\)/);
});

test("quest redirects never run using a featured pet from the previous account", () => {
  assert.match(home, /if \(!destination \|\| currentUser\.id !== user\.id\) return/);
  assert.match(home, /encodeURIComponent\(currentUser\.activePetId\)/);
  assert.match(home, /\[searchString, user\.id, currentUser\.id, currentUser\.activePetId, navigate\]/);
  assert.match(home, /: "\/bag"/);
  assert.match(home, /\?from=quest/);
});

test("defer retiring hidden Home pet code until dedicated-route regressions replace old assertions", () => {
  assert.match(home, /const AVATAR_10_HOME_CUTOVER = true/);
  assert.match(home, /!AVATAR_10_HOME_CUTOVER && \(<>/);
  assert.match(home, /<HomeAvatarStage/);
  assert.match(home, /<HomePlayerHud/);
  assert.match(home, /<ViewportBackdropPortal/);
  assert.match(home, /<WorldChatPanel/);
  assert.match(home, /<UserProfilePanel/);
});
