import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeClientService {
  private readonly logger = new Logger(StripeClientService.name);
  private readonly stripe: Stripe;

  constructor() {
    const apiKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
    this.stripe = new Stripe(apiKey);
  }

  /**
   * Verifies and constructs a Stripe event from the raw payload and signature header.
   */
  constructEvent(payload: Buffer | string, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy';
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }
}
