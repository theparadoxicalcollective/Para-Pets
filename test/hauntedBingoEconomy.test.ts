import assert from "node:assert/strict";
import test from "node:test";
import {
  HAUNTED_BINGO_BONUS_COUNT,
  HAUNTED_BINGO_ENTRY_COST,
  HAUNTED_BINGO_WIN_REWARD,
  createHauntedBingoBonuses,
  createHauntedBingoCard,
  hasHauntedBingo,
  hauntedBingoCasinoDay,
} from "../server/hauntedBingo";

const noShuffle = (max: number) => max - 1;

test("Haunted Bingo keeps the requested entry and win values", () => {
  assert.equal(HAUNTED_BINGO_ENTRY_COST, 100);
  assert.equal(HAUNTED_BINGO_WIN_REWARD, 500);
});

test("server-created Bingo cards use the correct column ranges and free center", () => {
  const card = createHauntedBingoCard(noShuffle);
  assert.equal(card.length, 5);
  assert.equal(card[2][2], null);

  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      if (row === 2 && column === 2) continue;
      const value = card[row][column];
      assert.equal(typeof value, "number");
      assert.ok((value as number) >= column * 15 + 1);
      assert.ok((value as number) <= column * 15 + 15);
    }
  }
});

test("coin bundles land on unique numbered spaces and never replace the free gem", () => {
  const bonuses = createHauntedBingoBonuses(noShuffle);
  assert.equal(bonuses.length, HAUNTED_BINGO_BONUS_COUNT);
  assert.equal(new Set(bonuses.map((bonus) => bonus.key)).size, HAUNTED_BINGO_BONUS_COUNT);
  assert.ok(bonuses.every((bonus) => bonus.key !== "2-2"));
  assert.ok(bonuses.every((bonus) => bonus.amount > 0));
});

test("Bingo validation recognizes rows, columns, and diagonals", () => {
  const free = "2-2";
  assert.equal(hasHauntedBingo(new Set([free, "0-0", "0-1", "0-2", "0-3", "0-4"])), true);
  assert.equal(hasHauntedBingo(new Set([free, "0-1", "1-1", "2-1", "3-1", "4-1"])), true);
  assert.equal(hasHauntedBingo(new Set([free, "0-0", "1-1", "3-3", "4-4"])), true);
  assert.equal(hasHauntedBingo(new Set([free, "0-4", "1-3", "3-1", "4-0"])), true);
  assert.equal(hasHauntedBingo(new Set([free, "0-0", "0-1", "0-2", "0-3"])), false);
});

test("casino day follows America/Chicago instead of the browser clock", () => {
  assert.equal(hauntedBingoCasinoDay(new Date("2026-09-04T04:30:00.000Z")), "2026-09-03");
});
