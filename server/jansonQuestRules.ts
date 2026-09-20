export const JANSON_WORLD_ID = "swamp";
export const JANSON_QUEST_KEYS = ["catch_fish", "sell_fish"] as const;
export type JansonQuestKey = typeof JANSON_QUEST_KEYS[number];
export type JansonQuestStatus = "locked" | "available" | "accepted" | "completed" | "claimed";

export function isJansonQuestKey(value: unknown): value is JansonQuestKey {
  return value === "catch_fish" || value === "sell_fish";
}

export function jansonQuestStatus(
  key: JansonQuestKey,
  row: { completed_at?: unknown; reward_claimed_at?: unknown } | null,
  fishingClaimed: boolean,
): JansonQuestStatus {
  if (key === "sell_fish" && !fishingClaimed) return "locked";
  if (!row) return "available";
  if (row.reward_claimed_at) return "claimed";
  return row.completed_at ? "completed" : "accepted";
}

/** Use the same America/Chicago calendar day as the game's daily quests. */
export function jansonQuestDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
