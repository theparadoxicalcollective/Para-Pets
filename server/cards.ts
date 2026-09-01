import { sql } from "drizzle-orm";
import type { db as database } from "./db";

type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
export const FIRST_CARD_REWARD = 100;
export interface CardBundleEntry { cardId: string; quantity: number }

export function parseBundleCards(value: unknown): CardBundleEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new Error("Choose up to 100 card types");
  const entries = new Map<string, number>();
  for (const entry of value) {
    if (!entry || typeof entry.cardId !== "string" || !entry.cardId.trim()
      || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 999) {
      throw new Error("Each card needs an ID and a quantity between 1 and 999");
    }
    const quantity = (entries.get(entry.cardId) ?? 0) + entry.quantity;
    if (quantity > 999) throw new Error("Each card quantity must be 999 or fewer");
    entries.set(entry.cardId, quantity);
  }
  return [...entries].map(([cardId, quantity]) => ({ cardId, quantity }));
}

/** Called inside the same transaction that marks the reward bundle claimed. */
export async function grantBundleCards(tx: Transaction, userId: string, bundleId: string): Promise<void> {
  await tx.execute(sql`
    INSERT INTO user_cards (user_id, card_id, quantity)
    SELECT ${userId}, card_id, quantity FROM reward_bundle_cards
    WHERE bundle_id = ${bundleId} ORDER BY card_id
    ON CONFLICT (user_id, card_id) DO UPDATE
    SET quantity = user_cards.quantity + EXCLUDED.quantity
  `);
}

export async function claimFirstCardReward(db: typeof database, userId: string, cardId: string) {
  return db.transaction(async tx => {
    // Use the same user-before-inventory lock order as coin reward bundles.
    const user = await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    if (!user.rows.length) return { claimed: false, coinsAwarded: 0 };
    const card = await tx.execute(sql`
      UPDATE user_cards SET first_reward_claimed_at = now()
      WHERE user_id = ${userId} AND card_id = ${cardId}
        AND quantity > 0 AND first_reward_claimed_at IS NULL
      RETURNING card_id
    `);
    if (!card.rows.length) return { claimed: false, coinsAwarded: 0 };
    const result = await tx.execute(sql`
      UPDATE users SET coins = coins + ${FIRST_CARD_REWARD},
        total_coins_earned = total_coins_earned + ${FIRST_CARD_REWARD}
      WHERE id = ${userId} RETURNING coins
    `);
    return { claimed: true, coinsAwarded: FIRST_CARD_REWARD, coins: Number(result.rows[0].coins) };
  });
}
