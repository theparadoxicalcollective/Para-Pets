/** The existing pet leveling curve, shared with read-only reward previews. */
export function xpForLevel(level: number): number {
  return Math.floor(100 + level * 30 + level * level * 5);
}

/** XP which can actually advance a pet before the level-100 cap. */
export function creditablePetXp(level: number, points: number, earned: number): number {
  let remaining = -Math.max(0, points);
  for (let current = Math.max(1, level); current < 100; current++) remaining += xpForLevel(current);
  return Math.max(0, Math.min(earned, remaining));
}
