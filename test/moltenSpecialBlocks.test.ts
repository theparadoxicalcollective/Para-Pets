import assert from "node:assert/strict";
import test from "node:test";
import {
  PETRIFY_COUNTDOWN_MS,
  tickPetrifyingBombs,
  petrifyOccupiedNeighbors,
  planMoltenLineClear,
  collapseMoltenRows,
} from "../client/src/lib/moltenSpecialBlocks";

test("petrifying bomb starts at 15 seconds and advances only by play time supplied", () => {
  const initial = [{ row: 2, col: 3, remainingMs: PETRIFY_COUNTDOWN_MS }];
  assert.equal(PETRIFY_COUNTDOWN_MS, 15000);
  const paused = tickPetrifyingBombs(initial, 0);
  assert.deepEqual(paused.active, initial);
  const ticking = tickPetrifyingBombs(initial, 14999);
  assert.equal(ticking.active[0].remainingMs, 1);
  const expired = tickPetrifyingBombs(ticking.active, 1);
  assert.deepEqual(expired.active, []);
  assert.deepEqual(expired.expired, [{ row: 2, col: 3, remainingMs: 0 }]);
  assert.equal(initial[0].remainingMs, 15000);
});

test("petrification affects only occupied cells in a clipped 3x3 neighborhood", () => {
  const board = [
    ["I", 0, "O"],
    [0, "T", "S"],
    ["J", 0, 0],
  ] as const;
  const stones = Array.from({ length: 3 }, () => [false, false, false]);
  const center = petrifyOccupiedNeighbors(board, stones, 1, 1);
  assert.deepEqual(center, [
    [true, false, true],
    [false, true, true],
    [true, false, false],
  ]);
  assert.deepEqual(stones[0], [false, false, false]);
  const edge = petrifyOccupiedNeighbors(board, stones, 0, 0);
  assert.deepEqual(edge, [
    [true, false, false],
    [false, true, false],
    [false, false, false],
  ]);
});

test("stone blocks ordinary full lines but a laser clears its row and adjacent rows", () => {
  const board = [
    ["I", "O", "T"],
    ["S", "Z", "J"],
    ["L", "I", "O"],
    ["T", 0, "S"],
    ["J", "L", "T"],
  ] as const;
  const stone = board.map(row => row.map(() => false));
  stone[0][1] = true;
  stone[1][0] = true;
  const lasers = board.map(row => row.map(() => false));
  assert.deepEqual(planMoltenLineClear(board, stone, lasers), { rows: [2, 4], laserRows: [] });
  lasers[1][2] = true;
  assert.deepEqual(planMoltenLineClear(board, stone, lasers), { rows: [0, 1, 2, 4], laserRows: [1] });
  lasers[4][1] = true;
  assert.deepEqual(planMoltenLineClear(board, stone, lasers), { rows: [0, 1, 2, 3, 4], laserRows: [1, 4] });
});

test("parallel board and special-cell metadata collapse by the same rows", () => {
  const board = [[1, 2], [3, 4], [5, 6]];
  const stone = [[false, true], [true, false], [false, false]];
  assert.deepEqual(collapseMoltenRows(board, [0, 2], 0), [[0, 0], [0, 0], [3, 4]]);
  assert.deepEqual(collapseMoltenRows(stone, [0, 2], false), [
    [false, false], [false, false], [true, false],
  ]);
});
