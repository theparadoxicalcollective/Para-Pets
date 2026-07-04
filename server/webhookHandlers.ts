import { getStripeSync } from './stripeClient';
import { storage } from './storage';

const VERIDIAN_WATCHER_ID = "veridian-watcher";

function communityRewardCoinsForUsd(amountUsd: number): number {
  const tiered: Record<number, number> = { 1: 0, 5: 0, 10: 0, 25: 50, 50: 100, 100: 500 };
  if (amountUsd in tiered) return tiered[amountUsd];
  return 0;
}

async function grantCommunityRewardFromWebhook(purchaserId: string, amountUsd: number): Promise<void> {
  try {
    const rewardCoins = communityRewardCoinsForUsd(amountUsd);
    if (rewardCoins <= 0) return;
    const allUsers = await storage.getAllUsers();
    const recipients = allUsers.filter(u => !u.isAdmin);
    if (recipients.length === 0) return;

    const bundle = await storage.createRewardBundle(
      "A Blessing from the Spirit of Veridia",
      rewardCoins,
      `A generous soul has contributed to the realm's growth, and the Spirit of Veridia has blessed you with ${rewardCoins} coins. Claim your gift!`
    );
    await Promise.all(recipients.map(u => storage.createUserReward(u.id, bundle.id)));

    await storage.addWorldChatMessage({
      userId: VERIDIAN_WATCHER_ID,
      username: "Veridian Watcher",
      profileImage: null,
      message: `🌟 A generous soul has contributed to the realm's growth, so the Spirit of Veridia has blessed us all! Every adventurer has received a gift — check your gift inbox to claim it.`,
      isBot: true,
    });
    console.log(`[Community Reward] Webhook granted ${rewardCoins} coins to ${recipients.length} players (purchase: $${amountUsd})`);
  } catch (err) {
    console.error("[Community Reward] Webhook failed to grant community reward:", err);
  }
}

const EGG_BONUS: Record<number, { shopItemId: string; itemName: string; itemImageUrl: string }> = {
  50:  { shopItemId: "5ac4de6d-bde6-4fe4-8211-32d5604ffa2a", itemName: "Violet Succubus Egg", itemImageUrl: "/api/media/62ecf53c-8bfd-40b2-9f65-ad27884d9b18" },
  100: { shopItemId: "670e8ef5-b67d-4be4-b340-3e652327975f", itemName: "The Paradox Egg",     itemImageUrl: "/api/media/e5019d66-d5a1-4f56-a7e6-e4f9bae5baee" },
};

// Monthly contribution reward bar milestones (points). Founder tier is NOT
// derived from these — it is based on lifetime USD spend (see FOUNDER_TIERS).
const MILESTONES: number[] = [500, 2500, 5000, 10000];
const FOUNDER_TIERS: [number, string][] = [
  [1000, 'legendary'],
  [500, 'gold'],
  [150, 'silver'],
  [50, 'bronze'],
];

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error('STRIPE WEBHOOK ERROR: Payload must be a Buffer.');
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    try {
      const event = JSON.parse(payload.toString());

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.payment_status === 'paid' && session.metadata?.userId && session.metadata?.coins) {
          await WebhookHandlers.creditCoinsFromSession(session);
        }
      }
    } catch (err) {
      console.error('Custom webhook handler error:', err);
    }
  }

  static async creditCoinsFromSession(session: any): Promise<void> {
    const sessionId = session.id;
    const userId = session.metadata.userId;
    const coins = parseInt(session.metadata.coins || '0');
    const amountUsd = parseInt(session.metadata.amountUsd || '0');

    if (coins <= 0 || !userId) return;

    const amountPaidCents = session.amount_total;
    if (amountPaidCents && amountPaidCents !== amountUsd * 100) {
      console.error(`Amount mismatch: expected ${amountUsd * 100} cents, got ${amountPaidCents}`);
      return;
    }

    const existing = await storage.getCoinPurchaseBySessionId(sessionId);
    if (existing) return;

    const awardedCoins = Math.round(coins * 1.33);

    try {
      await storage.createCoinPurchase(userId, amountUsd, awardedCoins, sessionId);
      await storage.addCoins(userId, awardedCoins);
      console.log(`[Webhook] Credited ${awardedCoins} coins (${coins} base + 33% bonus) to user ${userId} (session ${sessionId})`);

      // Community reward for all other players (fire-and-forget)
      grantCommunityRewardFromWebhook(userId, amountUsd).catch(() => {});

      // Progress bar + milestones + egg bonus (fire-and-forget)
      ;(async () => {
        try {
          const cycle = await storage.getContributionCycle(userId);
          const cycleKey = `c-${cycle}`;
          const progressPts = amountUsd * 100;
          const newTotal = await storage.addPurchaseProgress(userId, progressPts, cycleKey);
          console.log(`[Webhook] Progress for user ${userId}: +${progressPts} pts → total ${newTotal} (cycle ${cycle})`);

          const allRewards = await storage.getMilestoneRewards();
          const user = await storage.getUser(userId);

          for (const ms of MILESTONES) {
            if (newTotal >= ms) {
              const claimed = await storage.claimMilestone(userId, ms, cycleKey);
              if (claimed) {
                console.log(`[Webhook] Milestone ${ms} pts claimed for user ${userId} (cycle ${cycle})`);
                const rewardCfg = allRewards.find((r: any) => Number(r.milestone_points) === ms);
                if (rewardCfg) {
                  if (Number(rewardCfg.reward_coins) > 0) {
                    storage.addCoins(userId, Number(rewardCfg.reward_coins)).catch(() => {});
                  }
                  if (rewardCfg.reward_item_id) {
                    storage.sendGift({
                      senderId: userId,
                      receiverId: userId,
                      coinAmount: 0,
                      itemType: 'shop_item',
                      shopItemId: rewardCfg.reward_item_id,
                      itemName: rewardCfg.reward_item_name || 'Milestone Reward',
                      itemImageUrl: rewardCfg.reward_item_image_url || '',
                      itemQuantity: 1,
                      message: `🎉 Milestone reward: ${rewardCfg.reward_label || ms + ' pts milestone'}!`,
                    }).catch(() => {});
                  }
                }
                // When the final milestone is claimed, start a fresh cycle.
                if (ms === 10000) {
                  storage.incrementContributionCycle(userId).catch(() => {});
                }
              }
            }
          }

          // Founder Tier — based on LIFETIME (overall) coin-purchase spend in USD,
          // separate from the monthly contribution reward bar above. upsert is
          // upgrade-only, so existing founders are never downgraded.
          try {
            const lifetimeUsd = await storage.getLifetimePurchaseUsd(userId);
            const earned = FOUNDER_TIERS.find(([usd]) => lifetimeUsd >= usd);
            if (earned && user) {
              await storage.upsertFounderByUserId(userId, (user as any).username ?? '', earned[1]);
            }
          } catch (e) {
            console.error('[Webhook] Founder tier error:', e);
          }

          // Bonus pet egg for $50 / $100 bundles — delivered directly to
          // inventory so it appears immediately without visiting the gift inbox.
          const eggBonus = EGG_BONUS[amountUsd];
          if (eggBonus) {
            const eggInv = await storage.addToInventory(userId, eggBonus.shopItemId);
            // Start the hatch timer immediately, same as a normal shop purchase.
            await storage.updateInventoryItem(eggInv.id, { hatchStartedAt: new Date() });
            console.log(`[Webhook] Added egg bonus (${eggBonus.itemName}) directly to inventory for user ${userId}`);
          }
        } catch (e) {
          console.error('[Webhook] Progress/milestone/egg error:', e);
        }
      })();

    } catch (err: any) {
      if (err.code === '23505') {
        console.log(`[Webhook] Duplicate credit attempt for session ${sessionId}, already processed`);
      } else {
        throw err;
      }
    }
  }
}
