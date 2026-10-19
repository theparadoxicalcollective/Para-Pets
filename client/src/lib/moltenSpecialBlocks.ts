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

/** Special pieces total 30%: 10% single petrify, 5% double petrify, 15% laser. */
export const MOLTEN_SPECIAL_SPAWN_CHANCE = 0.30;

export type MoltenSpecialKind = "stone" | "double-stone" | "laser";

export function rollMoltenSpecial(roll: number): MoltenSpecialKind | null {
  if (!Number.isFinite(roll) || roll < 0 || roll >= MOLTEN_SPECIAL_SPAWN_CHANCE) return null;
  if (roll < 0.10) return "stone";
  if (roll < 0.15) return "double-stone";
  return "laser";
}

/** Resolve two bomb cells without overlapping even when only part of a piece is visible. */
export function moltenSpecialCellIndices(kind: MoltenSpecialKind, cellIdx: number, occupiedCount: number): number[] {
  if (occupiedCount <= 0) return [];
  const first = ((cellIdx % occupiedCount) + occupiedCount) % occupiedCount;
  if (kind !== "double-stone" || occupiedCount === 1) return [first];
  return [first, (first + 1) % occupiedCount];
}

/** A x2 block appears on 8% of otherwise ordinary pieces. */
export const MOLTEN_X2_SPAWN_CHANCE = 0.08;
/** Active play time, not wall-clock time. */
export const MOLTEN_X2_DURATION_MS = 20_000;
export const LASER_TRIPLE_BONUS_SCORE = 15;

/** The bonus triggers only when the laser actually clears exactly three rows. */
export function laserTripleScoreBonus(laserRows: readonly number[], clearedRows: readonly number[]): number {
  return laserRows.length > 0 && clearedRows.length === 3 ? LASER_TRIPLE_BONUS_SCORE : 0;
}

/** A petrified cell loses its x2 power-up permanently. */
export function removePetrifiedMultipliers(
  multipliers: readonly (readonly boolean[])[],
  stones: readonly (readonly boolean[])[],
): boolean[][] {
  return multipliers.map((row, r) => row.map((enabled, c) => enabled && !stones[r]?.[c]));
}

/** A cleared x2 tile starts or refreshes the temporary bonus. */
export function clearedMultiplier(
  multipliers: readonly (readonly boolean[])[],
  clearedRows: readonly number[],
): boolean {
  return clearedRows.some(row => multipliers[row]?.some(Boolean));
}

/** Multiply base points and direct bonus coins; tier coins are derived from the resulting score. */
export function moltenX2Multiplier(remainingMs: number, triggered: boolean): number {
  return triggered || remainingMs > 0 ? 2 : 1;
}

/** Reward balance: the rare coin pickup is independent of shop item drops. */
export const MOLTEN_COIN_PICKUP_AMOUNT = 10;
export const MOLTEN_COIN_PICKUP_INTERVAL_MIN = 15;
export const MOLTEN_COIN_PICKUP_INTERVAL_SPREAD = 11;
export const MOLTEN_LINE_SCORES = [0, 10, 25, 45, 70] as const;
export const MOLTEN_LASER_TRIPLE_BONUS = LASER_TRIPLE_BONUS_SCORE;
export const MOLTEN_LIVE_BOMB_CLEAR_BONUS = 5;
export const MOLTEN_PETRIFIED_RESCUE_BONUS = 5;

/** Score only distinct removed cells/rows; no credit for empty rows. */
export function moltenClearScore(
  clearedRows: readonly number[],
  laserRows: readonly number[],
  liveBombsCleared: number,
  petrifiedRowsRescued: number,
  multiplier: number,
): number {
  const lines = clearedRows.length;
  if (lines === 0) return 0;
  const base = lines <= 4 ? MOLTEN_LINE_SCORES[lines] : 70 + (lines - 4) * 10;
  const laserBonus = laserRows.length > 0 && lines === 3 ? MOLTEN_LASER_TRIPLE_BONUS : 0;
  return (base + laserBonus + Math.max(0,liveBombsCleared)*MOLTEN_LIVE_BOMB_CLEAR_BONUS + Math.max(0,petrifiedRowsRescued)*MOLTEN_PETRIFIED_RESCUE_BONUS) * multiplier;
}

/** A pickup is lost if petrified, and pays only when its row is removed. */
export function collectMoltenCoinPickups(
  pickups: readonly (readonly boolean[])[],
  stones: readonly (readonly boolean[])[],
  rows: readonly number[],
): number {
  return rows.reduce((total, row) => total + (pickups[row]?.filter((active,col) => active && !stones[row]?.[col]).length ?? 0), 0);
}

export function removePetrifiedCoinPickups(
  pickups: readonly (readonly boolean[])[],
  stones: readonly (readonly boolean[])[],
): boolean[][] {
  return pickups.map((row,r) => row.map((active,c) => active && !stones[r]?.[c]));
}
