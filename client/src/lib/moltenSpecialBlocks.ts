/**
 * Pure board rules for Molten Blocks special cells.
 *
 * These operate on the existing board's row/column coordinates. They do not
 * create another game loop, renderer, or viewport coordinate system.
 */
export const PETRIFY_COUNTDOWN_MS = 15_000;

export interface PetrifyingBomb {
  row: number;
  col: number;
  remainingMs: number;
}

export type StoneGrid = boolean[][];

/** Count down only elapsed active-play time. The caller must skip paused time. */
export function tickPetrifyingBombs(
  bombs: readonly PetrifyingBomb[],
  elapsedPlayMs: number,
): { active: PetrifyingBomb[]; expired: PetrifyingBomb[] } {
  const active: PetrifyingBomb[] = [];
  const expired: PetrifyingBomb[] = [];
  const delta = Math.max(0, elapsedPlayMs);
  for (const bomb of bombs) {
    const remainingMs = Math.max(0, bomb.remainingMs - delta);
    if (remainingMs === 0) expired.push({ ...bomb, remainingMs });
    else active.push({ ...bomb, remainingMs });
  }
  return { active, expired };
}

/** Petrify the bomb and occupied neighbors in its 3x3 area, never empty cells. */
export function petrifyOccupiedNeighbors<T>(
  board: readonly (readonly (T | 0)[])[],
  stones: StoneGrid,
  row: number,
  col: number,
): StoneGrid {
  const next = stones.map(line => [...line]);
  for (let r = Math.max(0, row - 1); r <= Math.min(board.length - 1, row + 1); r++) {
    for (let c = Math.max(0, col - 1); c <= Math.min(board[r].length - 1, col + 1); c++) {
      if (board[r][c] !== 0) next[r][c] = true;
    }
  }
  return next;
}

/**
 * Ordinary full rows containing stone stay locked. A full row containing a
 * laser triggers a three-row sweep that can also remove petrified cells.
 * Only rows in bounds are returned, so the board can collapse them once.
 */
export function planMoltenLineClear<T>(
  board: readonly (readonly (T | 0)[])[],
  stones: readonly (readonly boolean[])[],
  lasers: readonly (readonly boolean[])[],
): { rows: number[]; laserRows: number[] } {
  const clear = new Set<number>();
  const laserRows: number[] = [];
  for (let r = 0; r < board.length; r++) {
    if (!board[r].length || !board[r].every(cell => cell !== 0)) continue;
    if (lasers[r].some(Boolean)) {
      laserRows.push(r);
      for (let neighbor = Math.max(0, r - 1); neighbor <= Math.min(board.length - 1, r + 1); neighbor++) {
        clear.add(neighbor);
      }
    } else if (!stones[r].some(Boolean)) {
      clear.add(r);
    }
  }
  return { rows: [...clear].sort((a, b) => a - b), laserRows };
}

/** Collapse the same cleared rows in every parallel grid (board, items, stone). */
export function collapseMoltenRows<T>(grid: readonly (readonly T[])[], clearedRows: readonly number[], empty: T): T[][] {
  const cleared = new Set(clearedRows);
  const width = grid[0]?.length ?? 0;
  const remaining = grid.filter((_, row) => !cleared.has(row)).map(row => [...row]);
  return [
    ...Array.from({ length: cleared.size }, () => Array<T>(width).fill(empty)),
    ...remaining,
  ];
}

/** A special block appears on roughly one in six spawned pieces, split evenly. */
export const MOLTEN_SPECIAL_SPAWN_CHANCE = 0.16;

export function rollMoltenSpecial(roll: number): "stone" | "laser" | null {
  if (!Number.isFinite(roll) || roll < 0 || roll >= MOLTEN_SPECIAL_SPAWN_CHANCE) return null;
  return roll < MOLTEN_SPECIAL_SPAWN_CHANCE / 2 ? "stone" : "laser";
}
