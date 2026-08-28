import { sql } from "drizzle-orm";
import { db } from "../db";
import { awardedCoinsFor, coinPackageById, communityRewardCoinsForUsd, contributionPointsFor, type CoinPackage } from "./config";
import { StripePurchaseError } from "./errors";

export type TrustedCheckoutSession = {
  id: string;
  payment_status?: string | null;
  status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id: string } | null;
  metadata?: Record<string, string | undefined> | null;
};

export type FulfillmentResult = {
  status: "fulfilled" | "already_fulfilled";
  userId: string;
  coins: number;
  baseCoins: number;
  eggBonus: CoinPackage["eggBonus"] | null;
};

export type FulfillmentOperations = {
  run(input: { session: TrustedCheckoutSession; package: CoinPackage; eventId?: string }): Promise<"fulfilled" | "already_fulfilled">;
};

export async function executeStripePurchaseFulfillment(
  session: TrustedCheckoutSession,
  operations: FulfillmentOperations,
  options: { expectedUserId?: string; eventId?: string } = {},
): Promise<FulfillmentResult> {
  if (!session.id || session.payment_status !== "paid") throw new StripePurchaseError("unpaid", "Payment is not paid");
  if (session.status && session.status !== "complete") throw new StripePurchaseError("invalid_state", "Checkout is not complete");
  const userId = session.metadata?.userId;
  if (!userId) throw new StripePurchaseError("unknown_player", "Payment has no trusted player mapping");
  if (options.expectedUserId && options.expectedUserId !== userId) throw new StripePurchaseError("player_mismatch", "Payment belongs to another player");
  const pack = coinPackageById(session.metadata?.packId);
  if (!pack) throw new StripePurchaseError("unsupported_package", "Unsupported package");
  if (session.amount_total !== pack.priceUsd * 100) throw new StripePurchaseError("amount_mismatch", "Payment amount does not match package");
  if ((session.currency ?? "").toLowerCase() !== pack.currency) throw new StripePurchaseError("currency_mismatch", "Payment currency does not match package");

  const status = await operations.run({ session, package: pack, eventId: options.eventId });
  return { status, userId, coins: awardedCoinsFor(pack), baseCoins: pack.coins, eggBonus: pack.eggBonus ?? null };
}

const paymentIntentId = (session: TrustedCheckoutSession) =>
  typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

async function resolveEggBonusShopItemId(tx: any, bonus: NonNullable<CoinPackage["eggBonus"]>): Promise<string> {
  const matches = bonus.shopItemId
    ? await tx.execute(sql`
        SELECT id FROM shop_items
        WHERE id = ${bonus.shopItemId} AND type = 'pet'
        FOR SHARE
      `)
    : bonus.shopItemName
      ? await tx.execute(sql`
          SELECT id FROM shop_items
          WHERE name = ${bonus.shopItemName} AND type = 'pet'
          ORDER BY id
          LIMIT 2
          FOR SHARE
        `)
      : null;

  if (!matches || matches.rows.length !== 1) {
    throw new Error(`Coin package ${bonus.itemName} reward does not resolve to exactly one live pet`);
  }
  return String((matches.rows[0] as { id: string }).id);
}

export async function fulfillStripePurchase(
  session: TrustedCheckoutSession,
  options: { expectedUserId?: string; eventId?: string } = {},
): Promise<FulfillmentResult> {
  return executeStripePurchaseFulfillment(session, {
    async run({ session, package: pack, eventId }) {
      const userId = session.metadata!.userId!;
      const coins = awardedCoinsFor(pack);
      return db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO coin_purchases
            (user_id, amount_usd, coins_received, stripe_session_id, stripe_payment_intent_id,
             stripe_event_id, package_id, amount_cents, currency, fulfillment_status, updated_at)
          VALUES (${userId}, ${pack.priceUsd}, ${coins}, ${session.id}, ${paymentIntentId(session)},
                  ${eventId ?? null}, ${pack.id}, ${session.amount_total!}, ${pack.currency}, 'processing', NOW())
          ON CONFLICT (stripe_session_id) DO NOTHING
        `);
        const locked = await tx.execute(sql`
          SELECT user_id, fulfillment_status FROM coin_purchases
          WHERE stripe_session_id = ${session.id} FOR UPDATE
        `);
        const record = locked.rows[0] as { user_id: string; fulfillment_status: string } | undefined;
        if (!record) throw new StripePurchaseError("concurrent_conflict", "Unable to claim payment");
        if (record.user_id !== userId) throw new StripePurchaseError("player_mismatch", "Payment belongs to another player");
        if (record.fulfillment_status === "fulfilled") return "already_fulfilled" as const;

        const user = await tx.execute(sql`SELECT id, username FROM users WHERE id = ${userId} FOR UPDATE`);
        if (!user.rows[0]) throw new StripePurchaseError("unknown_player", "Mapped player does not exist");
        await tx.execute(sql`UPDATE users SET coins = coins + ${coins}, total_coins_earned = total_coins_earned + ${coins} WHERE id = ${userId}`);

        let bonusShopItemId: string | null = null;
        if (pack.eggBonus) {
          bonusShopItemId = await resolveEggBonusShopItemId(tx, pack.eggBonus);
          await tx.execute(sql`
            INSERT INTO user_inventory (user_id, shop_item_id, hatch_started_at)
            VALUES (${userId}, ${bonusShopItemId}, NOW())
          `);
        }

        const cycleResult = await tx.execute(sql`SELECT cycle FROM user_contribution_cycles WHERE user_id = ${userId} FOR UPDATE`);
        const cycle = Number((cycleResult.rows[0] as any)?.cycle ?? 1);
        await tx.execute(sql`
          INSERT INTO purchase_monthly_progress (user_id, month_year, points)
          VALUES (${userId}, ${`c-${cycle}`}, ${contributionPointsFor(pack)})
          ON CONFLICT (user_id, month_year) DO UPDATE
          SET points = purchase_monthly_progress.points + EXCLUDED.points
        `);

        const communityCoins = communityRewardCoinsForUsd(pack.priceUsd);
        if (communityCoins > 0) {
          const bundle = await tx.execute(sql`
            INSERT INTO reward_bundles (name, coin_amount, message)
            VALUES ('A Blessing from the Spirit of Veridia', ${communityCoins},
              ${`A generous soul has contributed to the realm's growth, and the Spirit of Veridia has blessed you with ${communityCoins} coins. Claim your gift!`})
            RETURNING id
          `);
          const bundleId = (bundle.rows[0] as any).id;
          await tx.execute(sql`
            INSERT INTO user_rewards (user_id, bundle_id)
            SELECT id, ${bundleId} FROM users WHERE is_admin = false
          `);
        }

        const lifetime = await tx.execute(sql`SELECT COALESCE(SUM(amount_usd), 0)::int AS total FROM coin_purchases WHERE user_id = ${userId}`);
        const total = Number((lifetime.rows[0] as any)?.total ?? 0);
        const tier = total >= 1000 ? "legendary" : total >= 500 ? "gold" : total >= 150 ? "silver" : total >= 50 ? "bronze" : null;
        if (tier) await tx.execute(sql`
          INSERT INTO founders (id, name, user_id, tier, added_by)
          VALUES (gen_random_uuid(), ${(user.rows[0] as any).username}, ${userId}, ${tier}, 'system')
          ON CONFLICT (user_id) DO UPDATE SET tier = CASE
            WHEN CASE founders.tier WHEN 'legendary' THEN 4 WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END
               < CASE EXCLUDED.tier WHEN 'legendary' THEN 4 WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END
            THEN EXCLUDED.tier ELSE founders.tier END
        `);

        const completed = await tx.execute(sql`
          UPDATE coin_purchases SET fulfillment_status = 'fulfilled', fulfilled_at = NOW(), updated_at = NOW(),
            stripe_event_id = COALESCE(${eventId ?? null}, stripe_event_id),
            result_metadata = ${JSON.stringify({ coins, baseCoins: pack.coins, eggBonus: bonusShopItemId, communityCoins })}::jsonb
          WHERE stripe_session_id = ${session.id} AND fulfillment_status = 'processing'
          RETURNING id
        `);
        if (!completed.rows[0]) throw new StripePurchaseError("concurrent_conflict", "Payment completion conflict");
        return "fulfilled" as const;
      });
    },
  }, options);
}
