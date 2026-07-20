import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/database/prisma.service';
import { ProcessWebhookCommand } from '../impl/process-webhook.command';
import { Prisma } from '@prisma/client';

export interface ProcessWebhookResult {
  status: 'PROCESSED' | 'ALREADY_PROCESSED';
  transactionId: string;
}

@Injectable()
export class ProcessWebhookHandler {
  private readonly logger = new Logger(ProcessWebhookHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(command: ProcessWebhookCommand): Promise<ProcessWebhookResult> {
    const {
      gateway,
      transactionCode,
      type,
      amount,
      currency,
      status,
      bankTimestamp,
      rawPayload,
      processingFee,
      parentTransactionCode,
      orderCode,
    } = command;

    // 1. Idempotency Check (unique index on transactionCode + gateway + type)
    const existing = await this.prisma.transaction.findFirst({
      where: {
        transactionCode,
        gateway,
        type,
      },
    });

    if (existing) {
      this.logger.log(
        `Webhook transaction already processed (Idempotent bypass): [${gateway}] ${transactionCode} (${type})`,
      );
      return {
        status: 'ALREADY_PROCESSED',
        transactionId: existing.id,
      };
    }

    // 2. Resolve parentTransactionId if this is a REFUND or DISPUTE
    let parentTransactionId: string | null = null;
    if (parentTransactionCode) {
      const parent = await this.prisma.transaction.findFirst({
        where: {
          transactionCode: parentTransactionCode,
          gateway,
          type: 'PAYMENT',
        },
      });
      if (parent) {
        parentTransactionId = parent.id;
      } else {
        this.logger.warn(
          `Parent transaction ${parentTransactionCode} not found for ${type} ${transactionCode}`,
        );
      }
    }

    // 3. Resolve orderId if orderCode provided
    let orderId: string | null = null;
    if (orderCode) {
      const order = await this.prisma.order.findUnique({
        where: { code: orderCode },
      });
      if (order) {
        orderId = order.id;
      }
    }

    const netAmount = amount - processingFee;

    // 4. Save transaction
    const newTxn = await this.prisma.transaction.create({
      data: {
        transactionCode,
        gateway,
        type,
        amount,
        currency,
        processingFee,
        netAmount,
        bankTimestamp,
        status,
        rawPayload: rawPayload as unknown as Prisma.InputJsonValue,
        parentTransactionId,
        orderId,
      },
    });

    this.logger.log(
      `Successfully processed webhook transaction: [${gateway}] ${transactionCode} (${type}) -> ID: ${newTxn.id}`,
    );

    return {
      status: 'PROCESSED',
      transactionId: newTxn.id,
    };
  }
}
