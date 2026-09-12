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

test("friend, hub, and world avatar surfaces reuse stable ids with a single page-level panel", () => {
  const expectations = [
    ["client/src/pages/FriendsPage.tsx", /userId=\{req\.requesterId\}/],
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

test("shared player card uses a compact octagonal horizontal identity", () => {
  const source = read("client/src/components/PlayerDetailPanel.tsx");
  assert.match(source, /polygon\(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%\)/);
  assert.match(source, /data-testid="player-identity-row"/);
  assert.match(source, /player-identity-row[\s\S]*img-player-profile[\s\S]*text-player-username/);
  assert.match(source, /flex min-w-0 items-center/);
});

test("shared player card sorts and divides side-mounted accessory controls", () => {
  const source = read("client/src/components/PlayerDetailPanel.tsx");
  assert.match(source, /\[\.\.\.equippedAccessories\]\.sort/);
  assert.match(source, /\(a\.slot \?\? 999\) - \(b\.slot \?\? 999\)/);
  assert.match(source, /sortedAccessories\.slice\(0, 3\)/);
  assert.match(source, /sortedAccessories\.slice\(3, 5\)/);
  assert.match(source, /equipment-column-left/);
  assert.match(source, /equipment-column-right/);
  assert.doesNotMatch(source, /data-testid="equipped-accessories-arc"/);
  assert.match(source, /onClick=\{\(\) => setAccessoryDetail\(acc\)\}/);
  assert.match(source, /data-testid=\{`button-acc-\$\{i\}`\}/);
});

test("shared player card retains companion information and visitor controls", () => {
  const source = read("client/src/components/PlayerDetailPanel.tsx");
  for (const testId of [
    "text-active-pet-name", "text-active-pet-level", "active-pet-stats",
    "button-add-friend", "button-visit-pethouse", "button-view-aquarium", "button-remove-friend",
  ]) assert.ok(source.includes(testId), testId);
  assert.match(source, /<RarityStars rarity=\{profile\.activePet\.rarity\}/);
  assert.match(source, /profile\.activePet\.specialSkill/);
});

test("admin item form saves a bounded accessory star rarity", () => {
  const form = read("client/src/components/ItemDatabaseSection.tsx");
  const schema = read("shared/schema.ts");
  assert.match(form, /select-accessory-stars/);
  assert.match(form, /effectiveType === "clearing" \|\| effectiveType === "accessory"/);
  assert.match(form, /Math\.max\(1, Math\.min\(5, parseInt\(starRarity\) \|\| 1\)\)/);
  assert.match(schema, /Accessory star rarity must be from 1 through 5/);
});

test("shared player card animates template pets idly with a still-image fallback", () => {
  const source = read("client/src/components/PlayerDetailPanel.tsx");
  assert.match(source, /import PetAnimator from "@\/components\/PetAnimator"/);
  assert.match(source, /profile\.activePet\.petTemplateId \? \(/);
  assert.match(source, /mode="idle"/);
  assert.match(source, /fitVisible/);
  assert.match(source, /\) : petImg \? \(/);
});
