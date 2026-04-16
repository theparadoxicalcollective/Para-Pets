import { getStripeSync } from './stripeClient';
import { storage } from './storage';

const VERIDIAN_WATCHER_ID = "veridian-watcher";

// Mirrors COIN_PACKS in routes.ts — keep in sync with the bundle ladder.
function communityRewardCoinsForUsd(amountUsd: number): number {
  const tiered: Record<number, number> = { 5: 50, 10: 100, 25: 500, 50: 1000, 100: 2500 };
  if (tiered[amountUsd]) return tiered[amountUsd];
  return Math.max(1, amountUsd * 10);
}

async function grantCommunityRewardFromWebhook(purchaserId: string, amountUsd: number): Promise<void> {
  try {
    const rewardCoins = communityRewardCoinsForUsd(amountUsd);
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

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer.'
      );
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

    try {
      await storage.createCoinPurchase(userId, amountUsd, coins, sessionId);
      await storage.addCoins(userId, coins);
      console.log(`Webhook credited ${coins} coins to user ${userId} (session ${sessionId})`);
      // Fire community reward for all other players (non-blocking)
      grantCommunityRewardFromWebhook(userId, amountUsd).catch(() => {});
    } catch (err: any) {
      if (err.code === '23505') {
        console.log(`Duplicate webhook credit attempt for session ${sessionId}, already processed`);
      } else {
        throw err;
      }
    }
  }
}
