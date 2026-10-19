import assert from "node:assert/strict";
import test from "node:test";
import {
  PETRIFY_COUNTDOWN_MS,
  MOLTEN_SPECIAL_SPAWN_CHANCE,
  rollMoltenSpecial,
  moltenSpecialCellIndices,
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

test("Molten bomb artwork is wired into active, locked and held-cell rendering", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("client/src/pages/MoltenBlocksPage.tsx", "utf8");
  assert.ok(page.includes('@assets/uploads/PetrifyingBomb.png'));
  assert.ok(page.includes('@assets/uploads/LaserBomb.png'));
  assert.ok(page.includes('const bombImgsRef = useRef'));
  assert.ok(page.includes('ctx.drawImage(image, x + pad, y + pad'));
  assert.ok(page.includes('ctx.drawImage(laserArt, x + pad, y + pad'));
  assert.ok(page.includes('ctx.fillText(String(Math.ceil(seconds))'));
});

test("single, double and laser special spawns have 5/3/12 percent probabilities", () => {
  assert.equal(MOLTEN_SPECIAL_SPAWN_CHANCE, 0.20);
  assert.equal(rollMoltenSpecial(0), "stone");
  assert.equal(rollMoltenSpecial(0.049999), "stone");
  assert.equal(rollMoltenSpecial(0.05), "double-stone");
  assert.equal(rollMoltenSpecial(0.079999), "double-stone");
  assert.equal(rollMoltenSpecial(0.08), "laser");
  assert.equal(rollMoltenSpecial(0.199999), "laser");
  assert.equal(rollMoltenSpecial(0.20), null);
  assert.equal(rollMoltenSpecial(0.9), null);
  assert.equal(rollMoltenSpecial(-1), null);
  assert.equal(rollMoltenSpecial(Number.NaN), null);
  const samples = Array.from({ length: 1000 }, (_, index) => rollMoltenSpecial((index + 0.5) / 1000));
  assert.equal(samples.filter(kind => kind === "stone").length, 50);
  assert.equal(samples.filter(kind => kind === "double-stone").length, 30);
  assert.equal(samples.filter(kind => kind === "laser").length, 120);
  assert.equal(samples.filter(kind => kind === null).length, 800);
});

test("double petrification occupies distinct cells and shares the existing countdown behavior", () => {
  assert.deepEqual(moltenSpecialCellIndices("double-stone", 2, 4), [2, 3]);
  assert.deepEqual(moltenSpecialCellIndices("double-stone", 3, 4), [3, 0]);
  assert.deepEqual(moltenSpecialCellIndices("double-stone", 3, 2), [1, 0]);
  assert.deepEqual(moltenSpecialCellIndices("double-stone", 0, 1), [0]);
  assert.deepEqual(moltenSpecialCellIndices("double-stone", 0, 0), []);
  assert.deepEqual(moltenSpecialCellIndices("laser", 2, 4), [2]);
  const bombs = moltenSpecialCellIndices("double-stone", 0, 4).map(col => ({ row: 1, col, remainingMs: PETRIFY_COUNTDOWN_MS }));
  const expired = tickPetrifyingBombs(bombs, PETRIFY_COUNTDOWN_MS);
  assert.equal(expired.active.length, 0);
  assert.equal(expired.expired.length, 2);
  const board = [
    ["T", "I", "J", 0],
    ["O", "S", "L", 0],
    [0, "Z", "T", 0],
  ] as const;
  let stones = board.map(row => row.map(() => false));
  for (const bomb of expired.expired) stones = petrifyOccupiedNeighbors(board, stones, bomb.row, bomb.col);
  assert.deepEqual(stones, [
    [true, true, true, false],
    [true, true, true, false],
    [false, true, true, false],
  ]);
});

test("double-petrifying pieces cannot be held and draw two active sprites", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("client/src/pages/MoltenBlocksPage.tsx", "utf8");
  assert.ok(page.includes('pendingSpecialRef.current?.kind === "double-stone"'));
  assert.ok(page.includes("for (const index of moltenSpecialCellIndices("));
  assert.ok(page.includes("for (const [row, col] of specialPositions)"));
});

test("petrified cells are greyed out rather than drawn as bomb sprites", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("client/src/pages/MoltenBlocksPage.tsx", "utf8");
  assert.ok(page.includes("rollMoltenSpecial(Math.random())"));
  assert.ok(page.includes("if (stoneRef.current[r][c])"));
  assert.ok(page.includes('ctx.fillStyle = "rgba(100,104,113,0.82)"'));
  assert.ok(page.includes('if (bomb) drawSpecial(x, y, "stone", bomb.remainingMs / 1000)'));
  assert.ok(!page.includes('drawSpecial(offX + c * cell, offY + r * cell, "stone", bomb?.remainingMs'));
});
