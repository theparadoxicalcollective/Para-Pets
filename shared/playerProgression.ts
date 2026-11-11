/** Player XP and stars belong to the account, never to the featured pet. */
export interface PlayerProgression {
  level: number;
  /** Lifetime account XP, preserved through every future Seer Elevation. */
  totalXp: number;
  /** Persistent completed Elevations. Optional for pre-12B test/mock compatibility. */
  stars?: number;
  /** Lifetime XP when the current 1–100 journey began. */
  cycleStartXp?: number;
}
export const INITIAL_PLAYER_PROGRESSION: Readonly<Required<PlayerProgression>> =
  Object.freeze({ level: 1, totalXp: 0, stars: 1, cycleStartXp: 0 });
export const MAX_PLAYER_TOTAL_XP = 2_147_483_647;
export const MAX_PLAYER_XP_AWARD = 1_000_000;
export const PLAYER_MAX_LEVEL = 100;
export const PLAYER_MAX_STARS = 5;

/** Story quests dominate; repeatable and competitive activities are intentionally small. */
export const PLAYER_XP_REWARDS = Object.freeze({
  storyQuest: 120,
  dailyQuest: 30,
  clearingVictory: 3,
  clearingBoss: 10,
  pvpWin: 2,
  newBadge: 8,
  fishingDailyCatch: 2, // Legacy receipt compatibility; new catches use rarity-based XP.
  minigameBest: 4,
});

/** Total XP required to begin a level within ONE 1–100 Elevation cycle. */
export function totalXpRequiredForPlayerLevel(level: number): number {
  const n = Math.max(0, Math.min(PLAYER_MAX_LEVEL - 1, Math.floor(level) - 1));
  // 80 XP for level 2, then +30 XP for each successive level.
  return 80 * n + 15 * n * (n - 1);
}

/** Per-cycle player level; no automatic Elevation beyond 100. */
export function levelForPlayerTotalXp(cycleXp: number): number {
  const total = Math.max(0, cycleXp);
  let low = 1;
  let high = PLAYER_MAX_LEVEL;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (totalXpRequiredForPlayerLevel(middle) <= total) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** Lifetime XP continues tracking achievements, but excess XP earned while
 * capped does not carry into the next cycle or auto-award player stars.
 */
export function playerCycleXp(progress: PlayerProgression | null | undefined): number {
  if (!progress) return 0;
  return Math.max(0, progress.totalXp - (progress.cycleStartXp ?? 0));
}

export function canPlayerElevate(progress: PlayerProgression | null | undefined): boolean {
  if (!progress) return false;
  return Math.max(1, progress.stars ?? 1) < PLAYER_MAX_STARS &&
    levelForPlayerTotalXp(playerCycleXp(progress)) === PLAYER_MAX_LEVEL;
}

/** Pure future Seer transition. Do NOT wire to a player-writable endpoint:
 * the future Seer NPC must authenticate, authorize and atomically commit it.
 * Level resets to 1, earned stars and lifetime XP are retained, and the
 * current XP remainder is discarded rather than carried to the next cycle.
 */
export function planSeerElevation(progress: PlayerProgression): Required<PlayerProgression> | null {
  if (!canPlayerElevate(progress)) return null;
  return {
    level: 1,
    stars: Math.max(1, progress.stars ?? 1) + 1,
    totalXp: progress.totalXp,
    cycleStartXp: progress.totalXp,
  };
}

export interface PlayerProgressionResponse {
  level: number;
  totalXp: number;
  /** XP earned since the last Elevation (may exceed the level-100 threshold). */
  cycleXp: number;
  stars: number;
  canElevate: boolean;
  nextLevelTotalXp: number | null;
  xpToNextLevel: number | null;
}

export function playerProgressionResponse(saved: PlayerProgression | null | undefined): PlayerProgressionResponse {
  const totalXp = saved?.totalXp ?? 0;
  const cycleXp = playerCycleXp(saved);
  // Legacy zero-star accounts receive the starting star without XP or pet changes.
  const stars = Math.max(1, saved?.stars ?? 1);
  // Always derive level from the current cycle, not lifetime XP or old pet XP.
  const level = levelForPlayerTotalXp(cycleXp);
  const nextLevelTotalXp = level < PLAYER_MAX_LEVEL ? totalXpRequiredForPlayerLevel(level + 1) : null;
  return {
    level,
    totalXp,
    cycleXp,
    stars,
    canElevate: stars < PLAYER_MAX_STARS && level === PLAYER_MAX_LEVEL,
    nextLevelTotalXp,
    xpToNextLevel: nextLevelTotalXp === null ? null : Math.max(0, nextLevelTotalXp - cycleXp),
  };
}
