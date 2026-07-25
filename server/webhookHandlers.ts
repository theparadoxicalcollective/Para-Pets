import { getStripeSync } from './stripeClient';
import { fulfillStripePurchase } from './payments/fulfillStripePurchase';
import { StripePurchaseError } from './payments/errors';
import { maybeAwardAcquisitionBadges } from './routes';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) throw new StripePurchaseError('invalid_state', 'Webhook payload must be raw bytes');

    // stripe-replit-sync performs Stripe signature verification before we inspect
    // or act on the event. Invalid signatures reject and never reach fulfillment.
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
    const event = JSON.parse(payload.toString());
    if (event.type !== 'checkout.session.completed') return;

    let result;
    try {
      result = await fulfillStripePurchase(event.data.object, { eventId: event.id });
    } catch (error) {
      // Valid but non-payable/irrelevant completion events are acknowledged.
      // Configuration/ownership mismatches remain failures so operators see them
      // and Stripe retries rather than silently losing a legitimate payment.
      if (error instanceof StripePurchaseError && ["unpaid", "invalid_state"].includes(error.code)) return;
      throw error;
    }
    if (result.status === 'fulfilled') {
      // Badge writes are idempotent and recoverable from durable purchase history;
      // they are deliberately non-critical after-commit notifications/progression.
      maybeAwardAcquisitionBadges(result.userId, event.data.object.amount_total / 100).catch(() => {});
    }
  }
}
