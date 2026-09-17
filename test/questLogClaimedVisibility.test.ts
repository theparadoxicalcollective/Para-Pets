import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("daily quest cards remain through completion and disappear only after reward claim", () => {
  const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

  assert.match(nav, /const visibleDailyQuests = questData\?\.quests\.filter\(q => !q\.reward_claimed\) \?\? \[\]/);
  assert.match(nav, /visibleDailyQuests\.map\(\(quest\) =>/);
  assert.match(nav, /onSuccess: async \(res, questKey\) =>/);
  assert.match(nav, /quest\.quest_key === questKey\s+\? \{ \.\.\.quest, reward_claimed: true \}/);
  assert.match(nav, /queryClient\.invalidateQueries\(\{ queryKey: \["\/api\/quests\/daily"\] \}\)/);
});

test("Beginning Tutorial disappears immediately after its reward claim succeeds", () => {
  const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

  assert.match(nav, /\{!\(user as any\)\.tutorial_reward_claimed && \(/);
  assert.match(nav, /queryClient\.setQueryData\(\["\/api\/auth\/me"\][\s\S]*tutorial_reward_claimed: true/);
});

test("Ginny quest card disappears after a successful reward claim", () => {
  const ginny = readFileSync("client/src/components/GinnyQuestOverlay.tsx", "utf8");

  assert.match(ginny, /setQueryData<GinnyQuestState>\(\["\/api\/quests\/ginny-mini-pet"\]/);
  assert.match(ginny, /status: "claimed"/);
  assert.match(ginny, /questListMount && state\.status !== "claimed" \? createPortal/);
});


test("quest alert appears only for completed unclaimed rewards and uses a simple exclamation badge", () => {
  const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

  assert.match(nav, /const hasCompletedUnclaimed = questData\?\.quests\.some\(q => q\.completed && !q\.reward_claimed\)/);
  assert.match(nav, /const questRewardReady = hasCompletedUnclaimed \|\| tutorialClaimable/);
  assert.match(nav, /function QuestRewardBadge/);
  assert.match(nav, />\s*!\s*<\/span>/);
  assert.match(nav, /badge=\{item\.id === "quest" && questRewardReady \? "quest" : null\}/);
  assert.doesNotMatch(nav, /lastOpened !== today/);
  assert.doesNotMatch(nav, /questBadge/);
  assert.doesNotMatch(nav, /seenMutation\.mutate/);
});
