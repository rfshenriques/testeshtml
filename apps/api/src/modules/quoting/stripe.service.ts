import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, Env } from '../../shared/config/config.module';

export interface CheckoutInput {
  quoteId: string; leadId: string; businessName: string; currency: string; buildFee: number; monthly: number; tier: string; successUrl: string; cancelUrl: string; customerEmail?: string | null;
}
export interface CheckoutSession { id: string; url: string }
export interface PaymentGateway {
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** Verify + parse a webhook; returns a normalised event or null when the signature is invalid. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ type: string; data: any } | null>;
}

/** Test double: records checkouts and accepts unsigned JSON webhooks. */
export class FakePaymentGateway implements PaymentGateway {
  checkouts: CheckoutInput[] = [];
  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    this.checkouts.push(input);
    const id = `cs_test_${this.checkouts.length}`;
    return { id, url: `https://checkout.stripe.test/${id}` };
  }
  async parseWebhook(rawBody: Buffer, signature: string | undefined) {
    if (signature !== 'fake-valid') return null;
    return JSON.parse(rawBody.toString());
  }
}

/** Stripe Checkout (one-off build fee + recurring monthly subscription) + Billing (spec §12.1). */
@Injectable()
export class StripeService implements PaymentGateway {
  private readonly log = new Logger(StripeService.name);
  private gateway: PaymentGateway;
  constructor(@Inject(ENV) private readonly env: Env) {
    this.gateway = env.STRIPE_SECRET_KEY ? new RealStripe(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET) : new FakePaymentGateway();
    if (!env.STRIPE_SECRET_KEY) this.log.warn('STRIPE_SECRET_KEY missing: payments use the fake gateway');
  }
  setGateway(g: PaymentGateway) {
    this.gateway = g;
  }
  createCheckout(input: CheckoutInput) {
    return this.gateway.createCheckout(input);
  }
  parseWebhook(rawBody: Buffer, signature: string | undefined) {
    return this.gateway.parseWebhook(rawBody, signature);
  }
}

class RealStripe implements PaymentGateway {
  private stripe: any;
  constructor(private readonly secretKey: string, private readonly webhookSecret: string) {}
  private sdk() {
    if (!this.stripe) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Stripe = require('stripe');
      this.stripe = new Stripe(this.secretKey);
    }
    return this.stripe;
  }
  async createCheckout(i: CheckoutInput): Promise<CheckoutSession> {
    const zeroDecimal = ['JPY', 'KRW', 'CLP', 'VND', 'XAF', 'XOF'].includes(i.currency.toUpperCase());
    const minor = (n: number) => Math.round(n * (zeroDecimal ? 1 : 100));
    const session = await this.sdk().checkout.sessions.create({
      mode: 'subscription',
      customer_email: i.customerEmail ?? undefined,
      line_items: [
        { price_data: { currency: i.currency.toLowerCase(), product_data: { name: `${i.tier} website build for ${i.businessName}` }, unit_amount: minor(i.buildFee) }, quantity: 1 },
        { price_data: { currency: i.currency.toLowerCase(), product_data: { name: `${i.tier} monthly services` }, unit_amount: minor(i.monthly), recurring: { interval: 'month' } }, quantity: 1 },
      ],
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
      metadata: { quoteId: i.quoteId, leadId: i.leadId, tier: i.tier },
      subscription_data: { metadata: { quoteId: i.quoteId, leadId: i.leadId, tier: i.tier } },
    });
    return { id: session.id, url: session.url };
  }
  async parseWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!signature || !this.webhookSecret) return null;
    try {
      const event = this.sdk().webhooks.constructEvent(rawBody, signature, this.webhookSecret);
      return { type: event.type, data: event.data.object };
    } catch {
      return null;
    }
  }
}
