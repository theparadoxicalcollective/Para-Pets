/** Player level and XP are account-owned; pet XP remains independent. */
export interface PlayerProgression {
  level: number;
  totalXp: number;
}
export const INITIAL_PLAYER_PROGRESSION: Readonly<PlayerProgression> = Object.freeze({ level: 1, totalXp: 0 });
export const MAX_PLAYER_TOTAL_XP = 2_147_483_647;
export const MAX_PLAYER_XP_AWARD = 1_000_000;
export const PLAYER_MAX_LEVEL = 100;

/** Story quests dominate; repeatable and competitive activities are intentionally small. */
export const PLAYER_XP_REWARDS = Object.freeze({
  storyQuest: 120,
  dailyQuest: 30,
  clearingVictory: 3,
  clearingBoss: 10,
  pvpWin: 2,
  newBadge: 8,
  minigameBest: 4,
});

/** Total cumulative XP required to begin a level (not XP for only that level). */
export function totalXpRequiredForPlayerLevel(level: number): number {
  const n = Math.max(0, Math.min(PLAYER_MAX_LEVEL - 1, Math.floor(level) - 1));
  return 80 * n + 20 * n * n;
}

/** A simple monotone curve, capped at level 100 even if lifetime XP continues. */
export function levelForPlayerTotalXp(totalXp: number): number {
  const total = Math.max(0, totalXp);
  let low = 1;
  let high = PLAYER_MAX_LEVEL;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (totalXpRequiredForPlayerLevel(middle) <= total) low = middle;
    else high = middle - 1;
  }
  return low;
}

export interface PlayerProgressionResponse extends PlayerProgression {
  nextLevelTotalXp: number | null;
  xpToNextLevel: number | null;
}

export function playerProgressionResponse(saved: PlayerProgression | null | undefined): PlayerProgressionResponse {
  const totalXp = saved?.totalXp ?? 0;
  // Derive rather than trust a stored level from an older version of the game.
  const level = levelForPlayerTotalXp(totalXp);
  const nextLevelTotalXp = level < PLAYER_MAX_LEVEL ? totalXpRequiredForPlayerLevel(level + 1) : null;
  return {
    level,
    totalXp,
    nextLevelTotalXp,
    xpToNextLevel: nextLevelTotalXp === null ? null : Math.max(0, nextLevelTotalXp - totalXp),
  };
}
