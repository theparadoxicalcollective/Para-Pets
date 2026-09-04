import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";

export const HAUNTED_BINGO_ENTRY_COST = 100;
export const HAUNTED_BINGO_WIN_REWARD = 500;
export const HAUNTED_BINGO_DAILY_FREE_GAMES = 1;
export const HAUNTED_BINGO_BONUS_COUNT = 3;

const BINGO_LETTERS = ["B", "I", "N", "G", "O"] as const;
const ALL_BALLS = Array.from({ length: 75 }, (_, index) => index + 1);
const FREE_CELL_KEY = "2-2";
const BONUS_VALUES = [25, 25, 50, 50, 75, 100, 150] as const;

type RandomInt = (maxExclusive: number) => number;
export type HauntedBingoCard = Array<Array<number | null>>;

export interface HauntedBingoBonus {
  key: string;
  amount: number;
}

export interface HauntedBingoPublicRound {
  id: string;
  status: "active" | "won" | "forfeited";
  card: HauntedBingoCard;
  called: number[];
  current: number | null;
  marked: string[];
  bonuses: HauntedBingoBonus[];
  entryCost: number;
  freeEntry: boolean;
  remainingCalls: number;
  baseReward: number;
  bonusReward: number;
  createdAt: string | null;
}

export interface HauntedBingoState {
  balances: { coins: number };
  entryCost: number;
  winReward: number;
  dailyFreeGames: number;
  freeGameAvailable: boolean;
  round: HauntedBingoPublicRound | null;
}

export interface HauntedBingoReward {
  baseCoins: number;
  bonusCoins: number;
  totalCoins: number;
  markedBonusCount: number;
}

export class HauntedBingoError extends Error {
  constructor(
    public code:
      | "player_not_found"
      | "insufficient_coins"
      | "round_not_found"
      | "round_finished"
      | "invalid_cell"
      | "invalid_mark"
      | "number_not_called",
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function hauntedBingoCasinoDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function shuffledWith<T>(values: readonly T[], randomInt: RandomInt = crypto.randomInt): T[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

export function createHauntedBingoCard(randomInt: RandomInt = crypto.randomInt): HauntedBingoCard {
  const columns = BINGO_LETTERS.map((_, columnIndex) => {
    const start = columnIndex * 15 + 1;
    return shuffledWith(Array.from({ length: 15 }, (_, index) => start + index), randomInt).slice(0, 5);
  });

  return Array.from({ length: 5 }, (_, rowIndex) =>
    Array.from({ length: 5 }, (_, columnIndex) =>
      rowIndex === 2 && columnIndex === 2 ? null : columns[columnIndex][rowIndex],
    ),
  );
}

export function createHauntedBingoBonuses(randomInt: RandomInt = crypto.randomInt): HauntedBingoBonus[] {
  const eligibleKeys: string[] = [];
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      const key = `${row}-${column}`;
      if (key !== FREE_CELL_KEY) eligibleKeys.push(key);
    }
  }

  return shuffledWith(eligibleKeys, randomInt)
    .slice(0, HAUNTED_BINGO_BONUS_COUNT)
    .map((key) => ({ key, amount: BONUS_VALUES[randomInt(BONUS_VALUES.length)] }));
}

export function hasHauntedBingo(marked: ReadonlySet<string>): boolean {
  for (let index = 0; index < 5; index++) {
    if (Array.from({ length: 5 }, (_, column) => `${index}-${column}`).every((key) => marked.has(key))) return true;
    if (Array.from({ length: 5 }, (_, row) => `${row}-${index}`).every((key) => marked.has(key))) return true;
  }
  if (Array.from({ length: 5 }, (_, index) => `${index}-${index}`).every((key) => marked.has(key))) return true;
  if (Array.from({ length: 5 }, (_, index) => `${index}-${4 - index}`).every((key) => marked.has(key))) return true;
  return false;
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 75);
}

function toMarkedArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [FREE_CELL_KEY];
  const marked = new Set(value.filter((entry): entry is string => typeof entry === "string"));
  marked.add(FREE_CELL_KEY);
  return [...marked];
}

function toBonuses(value: unknown): HauntedBingoBonus[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const key = String((entry as any).key ?? "");
    const amount = Number((entry as any).amount ?? 0);
    if (!/^\d-\d$/.test(key) || key === FREE_CELL_KEY || !Number.isInteger(amount) || amount <= 0) return [];
    return [{ key, amount }];
  });
}

function toCard(value: unknown): HauntedBingoCard {
  if (!Array.isArray(value) || value.length !== 5) return createHauntedBingoCard();
  return value.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== 5) return Array.from({ length: 5 }, () => null);
    return row.map((cell, columnIndex) => {
      if (rowIndex === 2 && columnIndex === 2) return null;
      const number = Number(cell);
      return Number.isInteger(number) && number >= 1 && number <= 75 ? number : null;
    });
  });
}

function publicRound(row: any): HauntedBingoPublicRound {
  const called = toNumberArray(row.called);
  const deck = toNumberArray(row.deck);
  return {
    id: String(row.id),
    status: row.status === "won" ? "won" : row.status === "forfeited" ? "forfeited" : "active",
    card: toCard(row.card),
    called,
    current: called.length ? called[called.length - 1] : null,
    marked: toMarkedArray(row.marked),
    bonuses: toBonuses(row.bonuses),
    entryCost: Number(row.entry_cost ?? 0),
    freeEntry: Boolean(row.free_entry),
    remainingCalls: deck.length,
    baseReward: Number(row.base_reward ?? HAUNTED_BINGO_WIN_REWARD),
    bonusReward: Number(row.bonus_reward ?? 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

async function freeGameAvailable(executor: any, userId: string, casinoDay: string): Promise<boolean> {
  const result = await executor.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM haunted_bingo_rounds
    WHERE user_id = ${userId}
      AND casino_date = ${casinoDay}::date
      AND free_entry = true
  `);
  return Number((result.rows[0] as any)?.count ?? 0) < HAUNTED_BINGO_DAILY_FREE_GAMES;
}

function stateEnvelope(
  coins: number,
  freeAvailable: boolean,
  round: HauntedBingoPublicRound | null,
): HauntedBingoState {
  return {
    balances: { coins },
    entryCost: HAUNTED_BINGO_ENTRY_COST,
    winReward: HAUNTED_BINGO_WIN_REWARD,
    dailyFreeGames: HAUNTED_BINGO_DAILY_FREE_GAMES,
    freeGameAvailable: freeAvailable,
    round,
  };
}

export async function getHauntedBingoState(userId: string): Promise<HauntedBingoState> {
  const casinoDay = hauntedBingoCasinoDay();
  const [userResult, roundResult] = await Promise.all([
    db.execute(sql`SELECT coins FROM users WHERE id = ${userId} LIMIT 1`),
    db.execute(sql`
      SELECT * FROM haunted_bingo_rounds
      WHERE user_id = ${userId} AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `),
  ]);
  const user = userResult.rows[0] as any;
  if (!user) throw new HauntedBingoError("player_not_found", 404, "Player not found");
  const freeAvailable = await freeGameAvailable(db, userId, casinoDay);
  const round = roundResult.rows[0] ? publicRound(roundResult.rows[0]) : null;
  return stateEnvelope(Number(user.coins ?? 0), freeAvailable, round);
}

export async function startHauntedBingoRound(userId: string): Promise<HauntedBingoState> {
  const casinoDay = hauntedBingoCasinoDay();

  return db.transaction(async (tx) => {
    const userResult = await tx.execute(sql`
      SELECT id, coins
      FROM users
      WHERE id = ${userId}
      FOR UPDATE
    `);
    const user = userResult.rows[0] as any;
    if (!user) throw new HauntedBingoError("player_not_found", 404, "Player not found");

    const existingResult = await tx.execute(sql`
      SELECT * FROM haunted_bingo_rounds
      WHERE user_id = ${userId} AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `);
    if (existingResult.rows[0]) {
      const freeAvailable = await freeGameAvailable(tx, userId, casinoDay);
      return stateEnvelope(Number(user.coins ?? 0), freeAvailable, publicRound(existingResult.rows[0]));
    }

    const freeEntry = await freeGameAvailable(tx, userId, casinoDay);
    const entryCost = freeEntry ? 0 : HAUNTED_BINGO_ENTRY_COST;
    if (Number(user.coins ?? 0) < entryCost) {
      throw new HauntedBingoError("insufficient_coins", 409, `You need ${HAUNTED_BINGO_ENTRY_COST} coins to play another Bingo card today`);
    }

    const card = createHauntedBingoCard();
    const deck = shuffledWith(ALL_BALLS);
    const bonuses = createHauntedBingoBonuses();

    const inserted = await tx.execute(sql`
      INSERT INTO haunted_bingo_rounds (
        user_id, casino_date, entry_cost, free_entry,
        card, deck, called, marked, bonuses, status,
        base_reward, bonus_reward, created_at, updated_at
      ) VALUES (
        ${userId}, ${casinoDay}::date, ${entryCost}, ${freeEntry},
        ${JSON.stringify(card)}::jsonb, ${JSON.stringify(deck)}::jsonb,
        '[]'::jsonb, ${JSON.stringify([FREE_CELL_KEY])}::jsonb,
        ${JSON.stringify(bonuses)}::jsonb, 'active',
        ${HAUNTED_BINGO_WIN_REWARD}, 0, now(), now()
      )
      RETURNING *
    `);

    let coins = Number(user.coins ?? 0);
    if (entryCost > 0) {
      const balanceResult = await tx.execute(sql`
        UPDATE users
        SET coins = coins - ${entryCost}
        WHERE id = ${userId}
        RETURNING coins
      `);
      coins = Number((balanceResult.rows[0] as any)?.coins ?? coins - entryCost);
    }

    return stateEnvelope(coins, false, publicRound(inserted.rows[0]));
  });
}

export async function callHauntedBingoBall(userId: string, roundId: string): Promise<HauntedBingoState> {
  const casinoDay = hauntedBingoCasinoDay();

  return db.transaction(async (tx) => {
    const roundResult = await tx.execute(sql`
      SELECT * FROM haunted_bingo_rounds
      WHERE id = ${roundId} AND user_id = ${userId}
      LIMIT 1
      FOR UPDATE
    `);
    const row = roundResult.rows[0] as any;
    if (!row) throw new HauntedBingoError("round_not_found", 404, "That Bingo card could not be found");
    if (row.status !== "active") throw new HauntedBingoError("round_finished", 409, "That Bingo game is already finished");

    const deck = toNumberArray(row.deck);
    const called = toNumberArray(row.called);
    let updatedRow = row;
    if (deck.length > 0) {
      const next = deck[0];
      const remaining = deck.slice(1);
      const nextCalled = [...called, next];
      const updated = await tx.execute(sql`
        UPDATE haunted_bingo_rounds
        SET deck = ${JSON.stringify(remaining)}::jsonb,
            called = ${JSON.stringify(nextCalled)}::jsonb,
            updated_at = now()
        WHERE id = ${roundId} AND user_id = ${userId} AND status = 'active'
        RETURNING *
      `);
      updatedRow = updated.rows[0] as any;
    }

    const userResult = await tx.execute(sql`SELECT coins FROM users WHERE id = ${userId} LIMIT 1`);
    const user = userResult.rows[0] as any;
    if (!user) throw new HauntedBingoError("player_not_found", 404, "Player not found");
    const freeAvailable = await freeGameAvailable(tx, userId, casinoDay);
    return stateEnvelope(Number(user.coins ?? 0), freeAvailable, publicRound(updatedRow));
  });
}

export async function markHauntedBingoCell(
  userId: string,
  roundId: string,
  requestedRow: unknown,
  requestedColumn: unknown,
  requestedMarked: unknown,
): Promise<HauntedBingoState & { reward: HauntedBingoReward | null }> {
  const rowIndex = Number(requestedRow);
  const columnIndex = Number(requestedColumn);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex > 4 || !Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex > 4) {
    throw new HauntedBingoError("invalid_cell", 400, "Choose a valid Bingo space");
  }
  if (rowIndex === 2 && columnIndex === 2) {
    throw new HauntedBingoError("invalid_cell", 400, "The center gem is always free");
  }
  if (typeof requestedMarked !== "boolean") {
    throw new HauntedBingoError("invalid_mark", 400, "Mark state must be true or false");
  }

  const casinoDay = hauntedBingoCasinoDay();
  return db.transaction(async (tx) => {
    const roundResult = await tx.execute(sql`
      SELECT * FROM haunted_bingo_rounds
      WHERE id = ${roundId} AND user_id = ${userId}
      LIMIT 1
      FOR UPDATE
    `);
    const row = roundResult.rows[0] as any;
    if (!row) throw new HauntedBingoError("round_not_found", 404, "That Bingo card could not be found");
    if (row.status !== "active") throw new HauntedBingoError("round_finished", 409, "That Bingo game is already finished");

    const card = toCard(row.card);
    const value = card[rowIndex]?.[columnIndex];
    if (value == null) throw new HauntedBingoError("invalid_cell", 400, "Choose a numbered Bingo space");
    const called = new Set(toNumberArray(row.called));
    if (requestedMarked && !called.has(value)) {
      throw new HauntedBingoError("number_not_called", 409, "That number has not been called yet");
    }

    const key = `${rowIndex}-${columnIndex}`;
    const marked = new Set(toMarkedArray(row.marked));
    if (requestedMarked) marked.add(key);
    else marked.delete(key);
    marked.add(FREE_CELL_KEY);

    const won = hasHauntedBingo(marked);
    const bonuses = toBonuses(row.bonuses);
    const markedBonuses = won ? bonuses.filter((bonus) => marked.has(bonus.key)) : [];
    const bonusCoins = markedBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
    const totalCoins = won ? HAUNTED_BINGO_WIN_REWARD + bonusCoins : 0;

    const updatedRoundResult = await tx.execute(sql`
      UPDATE haunted_bingo_rounds
      SET marked = ${JSON.stringify([...marked])}::jsonb,
          status = ${won ? "won" : "active"},
          bonus_reward = ${won ? bonusCoins : 0},
          paid_out_at = ${won ? new Date() : null},
          updated_at = now()
      WHERE id = ${roundId} AND user_id = ${userId} AND status = 'active'
      RETURNING *
    `);
    const updatedRow = updatedRoundResult.rows[0] as any;
    if (!updatedRow) throw new HauntedBingoError("round_finished", 409, "That Bingo game is already finished");

    let coins: number;
    let reward: HauntedBingoReward | null = null;
    if (won) {
      const balanceResult = await tx.execute(sql`
        UPDATE users
        SET coins = coins + ${totalCoins},
            total_coins_earned = COALESCE(total_coins_earned, 0) + ${totalCoins}
        WHERE id = ${userId}
        RETURNING coins
      `);
      if (!balanceResult.rows[0]) throw new HauntedBingoError("player_not_found", 404, "Player not found");
      coins = Number((balanceResult.rows[0] as any).coins ?? 0);
      reward = {
        baseCoins: HAUNTED_BINGO_WIN_REWARD,
        bonusCoins,
        totalCoins,
        markedBonusCount: markedBonuses.length,
      };
    } else {
      const userResult = await tx.execute(sql`SELECT coins FROM users WHERE id = ${userId} LIMIT 1`);
      if (!userResult.rows[0]) throw new HauntedBingoError("player_not_found", 404, "Player not found");
      coins = Number((userResult.rows[0] as any).coins ?? 0);
    }

    const freeAvailable = await freeGameAvailable(tx, userId, casinoDay);
    return {
      ...stateEnvelope(coins, freeAvailable, publicRound(updatedRow)),
      reward,
    };
  });
}
