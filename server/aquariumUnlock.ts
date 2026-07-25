import { sql } from "drizzle-orm";
import { db } from "./db";

export const AQUARIUM_PRICES = Object.freeze({
  bayou: 20_000,
  volcanic: 25_000,
} as const);

export type AquariumId = keyof typeof AQUARIUM_PRICES;
export type AquariumUnlockFailure =
  | "invalid-aquarium"
  | "already-unlocked"
  | "insufficient-funds";

export class AquariumUnlockError extends Error {
  constructor(public readonly reason: AquariumUnlockFailure) {
    super(reason);
    this.name = "AquariumUnlockError";
  }
}

export interface AquariumUnlockResult {
  ok: true;
  coinsRemaining: number;
}

function isAquariumId(value: string): value is AquariumId {
  return Object.prototype.hasOwnProperty.call(AQUARIUM_PRICES, value);
}

/**
 * Debits the authenticated player and grants one aquarium in a single
 * PostgreSQL transaction. The advisory lock protects the absent ownership-row
 * case; the users row lock establishes a deterministic balance mutation order.
 */
export async function purchaseAquariumUnlock(
  userId: string,
  aquariumId: string,
): Promise<AquariumUnlockResult> {
  return db.transaction(async (tx) => {
    if (!isAquariumId(aquariumId)) {
      throw new AquariumUnlockError("invalid-aquarium");
    }
    const price = AQUARIUM_PRICES[aquariumId];

    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${aquariumId}))
    `);

    const playerResult = await tx.execute(sql`
      SELECT id, coins
      FROM users
      WHERE id = ${userId}
      FOR UPDATE
    `);
    const player = playerResult.rows[0] as { id: string; coins: number } | undefined;
    if (!player) throw new Error("Aquarium unlock player row missing");

    const ownershipResult = await tx.execute(sql`
      SELECT id
      FROM player_aquarium_unlocks
      WHERE user_id = ${userId} AND aquarium_id = ${aquariumId}
      FOR UPDATE
    `);
    if (ownershipResult.rows.length > 0) {
      throw new AquariumUnlockError("already-unlocked");
    }

    const balanceResult = await tx.execute(sql`
      UPDATE users
      SET coins = coins - ${price}
      WHERE id = ${userId} AND coins >= ${price}
      RETURNING coins
    `);
    const balance = balanceResult.rows[0] as { coins: number } | undefined;
    if (!balance) throw new AquariumUnlockError("insufficient-funds");

    const insertResult = await tx.execute(sql`
      INSERT INTO player_aquarium_unlocks (user_id, aquarium_id)
      VALUES (${userId}, ${aquariumId})
      ON CONFLICT (user_id, aquarium_id) DO NOTHING
      RETURNING id
    `);
    if (insertResult.rows.length !== 1) {
      throw new Error("Aquarium ownership insert did not create exactly one row");
    }

    return { ok: true, coinsRemaining: balance.coins };
  });
}

export function getAquariumUnlockErrorReason(error: unknown): AquariumUnlockFailure | null {
  return error instanceof AquariumUnlockError ? error.reason : null;
}
