/**
 * Player progression is account-owned and entirely separate from pet level
 * and pet XP on user_inventory. The curve and reward sources are deliberately
 * not chosen in Avatar 05/12; later award integrations must supply the policy.
 */
export interface PlayerProgression {
  level: number;
  totalXp: number;
}

export const INITIAL_PLAYER_PROGRESSION: Readonly<PlayerProgression> = Object.freeze({
  level: 1,
  totalXp: 0,
});

/** PostgreSQL integer storage limit. Reject overflow rather than wrapping XP. */
export const MAX_PLAYER_TOTAL_XP = 2_147_483_647;
export const MAX_PLAYER_XP_AWARD = 1_000_000;

export interface PlayerProgressionResponse extends PlayerProgression {
  /** Null until the player-level curve has been approved. */
  nextLevelTotalXp: number | null;
  /** Not the old active pet's level or XP. */
  xpToNextLevel: number | null;
}

export function playerProgressionResponse(
  saved: PlayerProgression | null | undefined,
): PlayerProgressionResponse {
  return {
    level: saved?.level ?? INITIAL_PLAYER_PROGRESSION.level,
    totalXp: saved?.totalXp ?? INITIAL_PLAYER_PROGRESSION.totalXp,
    nextLevelTotalXp: null,
    xpToNextLevel: null,
  };
}
