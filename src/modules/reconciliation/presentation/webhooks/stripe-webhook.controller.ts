import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { Public } from '../../../auth/decorators/public.decorator';
import { StripeClientService } from '../../infrastructure/gateways/stripe.client';
import { ProcessWebhookHandler } from '../../application/commands/handlers/process-webhook.handler';
import { ProcessWebhookCommand } from '../../application/commands/impl/process-webhook.command';

@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeClient: StripeClientService,
    private readonly handler: ProcessWebhookHandler,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const payload = (req.rawBody ?? req.body) as Buffer | string;
    if (!payload) {
      throw new BadRequestException('Missing or invalid raw webhook payload');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeClient.constructEvent(payload, signature);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Stripe signature verification failed: ${msg}`);
      throw new BadRequestException(`Webhook Error: ${msg}`);
    }

    this.logger.log(`Received Stripe event: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const txnCode = pi.id;
        const amount = pi.amount / 100; // Stripe amounts are in cents
        const currency = pi.currency.toUpperCase();
        const createdDate = new Date(pi.created * 1000);
        const orderCode = pi.metadata?.orderCode;

        await this.handler.execute(
          new ProcessWebhookCommand(
            'stripe',
            txnCode,
            'PAYMENT',
            amount,
            currency,
            'SUCCESS',
            createdDate,
            pi as unknown as Record<string, unknown>,
            0,
            undefined,
            orderCode,
          ),
        );
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const refundTxnCode = `${charge.id}_refund`;
        const parentTxnCode =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id;
        const amount = (charge.amount_refunded ?? charge.amount) / 100;
        const currency = charge.currency.toUpperCase();
        const createdDate = new Date(charge.created * 1000);

        await this.handler.execute(
          new ProcessWebhookCommand(
            'stripe',
            refundTxnCode,
            'REFUND',
            amount,
            currency,
            'REFUNDED',
            createdDate,
            charge as unknown as Record<string, unknown>,
            0,
            parentTxnCode,
          ),
        );
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object;
        const disputeTxnCode = dispute.id;
        const parentTxnCode =
          typeof dispute.payment_intent === 'string'
            ? dispute.payment_intent
            : dispute.payment_intent?.id;
        const amount = dispute.amount / 100;
        const currency = dispute.currency.toUpperCase();
        const createdDate = new Date(dispute.created * 1000);

        await this.handler.execute(
          new ProcessWebhookCommand(
            'stripe',
            disputeTxnCode,
            'DISPUTE',
            amount,
            currency,
            'DISPUTED',
            createdDate,
            dispute as unknown as Record<string, unknown>,
            0,
            parentTxnCode,
          ),
        );
        break;
      }

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }

    return { received: true };
  }
}
