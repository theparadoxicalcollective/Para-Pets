import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

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
      const stripe = await getUncachableStripeClient();
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
    } catch (err: any) {
      if (err.code === '23505') {
        console.log(`Duplicate webhook credit attempt for session ${sessionId}, already processed`);
      } else {
        throw err;
      }
    }
  }
}
