import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { playerAvatarQueryKey, PLAYER_AVATAR_QUERY_KEY } from "../client/src/lib/playerAvatarWardrobe";
import { canEnterDuringMaintenance } from "../shared/maintenanceAccess";

const read = (path: string) => readFileSync(path, "utf8");

test("one account-scoped key is shared by Home, Clearing, and wardrobe", () => {
  const home = read("client/src/components/HomeAvatarStage.tsx");
  const clearing = read("client/src/components/WalkAroundScene.tsx");
  const wardrobe = read("client/src/pages/PlayerAvatarPage.tsx");
  const app = read("client/src/App.tsx");

  assert.match(home, /queryKey: playerAvatarQueryKey\(userId\)/);
  assert.match(clearing, /queryKey: playerAvatarQueryKey\(userId \?\? ""\)/);
  assert.match(wardrobe, /const avatarKey = playerAvatarQueryKey\(userId\)/);
  assert.match(wardrobe, /queryKey: avatarKey/);
  assert.match(wardrobe, /qc\.setQueryData\(playerAvatarQueryKey\(accountId\), saved\)/);
  assert.match(wardrobe, /cacheSavedAvatar\(saved, input\.accountId\)/);
  assert.match(wardrobe, /if \(input\.accountId !== userId\) return/);
  assert.match(wardrobe, /qc\.invalidateQueries\(\{ queryKey: playerAvatarQueryKey\(input\.accountId\) \}\)/);
  assert.match(app, /<PlayerAvatarPage userId=\{user\.id\}/);
  assert.doesNotMatch(wardrobe, /qc\.setQueryData\(PLAYER_AVATAR_QUERY_KEY/);
  assert.doesNotMatch(wardrobe, /queryKey: PLAYER_AVATAR_QUERY_KEY/);
  assert.doesNotMatch(wardrobe, /\["\/api\/auth\/me"\]/);
});

test("user A's outfit and revision never get stored under user B or the unscoped API key", async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const a = playerAvatarQueryKey("account-A");
  const b = playerAvatarQueryKey("account-B");
  const userA = { created: true, revision: 4, equipped: [{ inventoryId: "hat-A" }] };
  const userB = { created: true, revision: 11, equipped: [{ inventoryId: "hat-B" }] };
  cache.setQueryData(a, userA);
  cache.setQueryData(b, userB);
  assert.deepEqual(a, ["/api/player-avatar", "account-A"]);
  assert.deepEqual(b, ["/api/player-avatar", "account-B"]);
  assert.notDeepEqual(a, b);
  assert.deepEqual(cache.getQueryData(a), userA);
  assert.deepEqual(cache.getQueryData(b), userB);
  assert.equal(cache.getQueryData(PLAYER_AVATAR_QUERY_KEY), undefined,
    "Player-owned state must never populate the unscoped prefix");
  const updatedA = { ...userA, revision: 5, equipped: [{ inventoryId: "pants-A" }] };
  cache.setQueryData(a, updatedA);
  assert.deepEqual(cache.getQueryData(a), updatedA);
  assert.deepEqual(cache.getQueryData(b), userB, "Saving one account leaves the other intact");
  await cache.invalidateQueries({ queryKey: a });
  assert.equal(cache.getQueryState(a)?.isInvalidated, true);
  assert.equal(cache.getQueryState(b)?.isInvalidated, false);
  cache.clear();
});

test("Home now delegates pet workflows to dedicated routes without altering inventory or cave ownership", () => {
  const home = read("client/src/pages/HomePage.tsx");
  const inventory = read("client/src/components/PetInventory.tsx");
  const roadmap = read("docs/PLAYER_AVATAR_ROADMAP.md");
  assert.match(home, /<HomeAvatarStage/);
  assert.doesNotMatch(home, /AVATAR_10_HOME_CUTOVER|PetPowerUpPage|hatchHomeMutation|homePettingRewardMutation/);
  assert.match(home, /encodeURIComponent\(homeUser\.activePetId\)/);
  assert.match(home, /\?from=quest/);
  assert.match(inventory, /Set Featured Companion/);
  assert.match(roadmap, /12C\/12/);
  assert.match(roadmap, /Murk Cave/);
  assert.match(roadmap, /physical iOS/);
});

test("player XP rewards are still gated on an approved curve and trusted event sources", () => {
  const route = read("server/routes/playerProgression.routes.ts");
  const award = read("server/playerProgressionStorage.ts");
  const schema = read("shared/playerProgression.ts");
  assert.match(route, /app\.get\("\/api\/player\/progression"/);
  assert.doesNotMatch(route, /app\.post|app\.patch|app\.put/);
  assert.match(award, /levelForPlayerTotalXp/);
  assert.match(award, /playerXpReceipts/);
  assert.match(schema, /nextLevelTotalXp:/);
  assert.match(read("docs/PLAYER_AVATAR_ROADMAP.md"), /12B\/12/);
});

test("admin-only world drafts, maintenance roles and desktop boundary remain distinct", () => {
  const draft = read("server/routes/worldSceneDraft.routes.ts");
  const content = read("server/routes/worldSceneContent.routes.ts");
  const app = read("client/src/App.tsx");
  assert.match(draft, /app\.get\("\/api\/admin\/world-editor\/.*isAdmin/);
  assert.match(draft, /app\.put\("\/api\/admin\/world-editor\/.*isAdmin/);
  assert.match(content, /isAdmin: RequestHandler/);
  assert.equal(canEnterDuringMaintenance({ isAdmin: false, isModerator: true }), true);
  assert.equal(canEnterDuringMaintenance({ isAdmin: false, isModerator: false }), false);
  assert.match(app, /maintenanceOn && user && !canEnterDuringMaintenance\(user\)/);
  assert.match(read("docs/PLAYER_AVATAR_ROADMAP.md"), /desktop gameplay remains locked/i);
});
