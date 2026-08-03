import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared avatar triggers are semantic and never infer identity from display data", () => {
  const source = read("client/src/components/PlayerAvatarButton.tsx");
  assert.match(source, /<button/);
  assert.match(source, /aria-label=.*View/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /if \(canOpen\) onSelectPlayer\(userId\)/);
  assert.doesNotMatch(source, /profileImage.*userId|username.*userId/);
});

test("forum posts, comments, and nested replies route stable author ids to one shared panel", () => {
  const client = read("client/src/pages/ForumPage.tsx");
  const server = read("server/routes.ts");
  assert.match(server, /SELECT fp\.id[\s\S]*fp\.author_id, u\.username AS author_name/);
  assert.match(client, /userId=\{post\.author_id\}/);
  assert.match(client, /userId=\{c\.author_id\}/);
  assert.match(client, /userId=\{r\.author_id\}/);
  assert.match(client, /onSelectPlayer=\{setSelectedPlayerId\}/);
  assert.equal((client.match(/<PlayerDetailPanel/g) ?? []).length, 1);
});

test("player leaderboards mount one shared panel per logical overlay instead of one per row", () => {
  const files = [
    "client/src/pages/FishingPage.tsx",
    "client/src/pages/RaidLeaderboardPage.tsx",
    "client/src/pages/LavaCrawlPage.tsx",
    "client/src/pages/MoltenBlocksPage.tsx",
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /PlayerAvatarButton/);
    assert.equal((source.match(/<PlayerDetailPanel/g) ?? []).length, 1, file);
    assert.match(source, /selectedPlayerId/);
  }
});

test("friend, hub, home, and world avatar surfaces reuse stable ids with a single page-level panel", () => {
  const expectations = [
    ["client/src/pages/FriendsPage.tsx", /userId=\{req\.requesterId\}/],
    ["client/src/pages/HomePage.tsx", /userId=\{req\.requesterId\}/],
    ["client/src/pages/ParaPetsHubPage.tsx", /userId=\{member\.id\}/],
    ["client/src/pages/PetWorldPage.tsx", /userId=\{pet\.userId\}/],
    ["client/src/components/UserProfilePanel.tsx", /userId=\{req\.requesterId\}/],
  ] as const;
  for (const [file, idPattern] of expectations) {
    const source = read(file);
    assert.match(source, /PlayerAvatarButton/);
    assert.match(source, idPattern);
    assert.equal((source.match(/<PlayerDetailPanel/g) ?? []).length, 1, file);
  }
});

test("game leaderboard responses expose stable user ids alongside display fields", () => {
  const routes = read("server/routes.ts");
  const storage = read("server/storage.ts");
  assert.match(routes, /SELECT u\.id AS user_id, u\.username, u\.profile_image/);
  assert.match(storage, /userId: r\.id/);
});
