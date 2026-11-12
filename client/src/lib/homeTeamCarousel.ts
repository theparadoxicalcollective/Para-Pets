/**
 * Five visible positions orbit the Home team without changing the shared
 * PvP/Raid roster. Slot indexes remain stable for editing and persistence.
 *
 * A positive rotation moves the right-hand companion toward the large center
 * position. A negative rotation moves the left-hand companion into the center.
 */
export const HOME_TEAM_VISIBLE_SLOTS = 5;

export function homeTeamOffset(offset: number, count = HOME_TEAM_VISIBLE_SLOTS): number {
  if (!Number.isSafeInteger(count) || count < 1) return 0;
  return ((Math.trunc(offset) % count) + count) % count;
}

export function homeTeamVisualPosition(rosterSlot: number, offset: number,
  count = HOME_TEAM_VISIBLE_SLOTS): number {
  return homeTeamOffset(rosterSlot - offset, count);
}

/** Return 0 for a tap or vertical scroll; only purposeful horizontal drags rotate. */
export function homeTeamSwipeStep(deltaX: number, deltaY: number): -1 | 0 | 1 {
  if (Math.abs(deltaX) < 38 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return 0;
  // Swipe left moves the next (right) pet to center.
  return deltaX < 0 ? 1 : -1;
}
