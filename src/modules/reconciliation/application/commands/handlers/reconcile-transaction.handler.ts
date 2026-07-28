import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/database/prisma.service';
import { RedlockService } from '../../../../../shared/redis/redlock.service';
import { ReconcileTransactionCommand } from '../impl/reconcile-transaction.command';
import {
  MatchingEngine,
  MatchResult,
} from '../../../domain/matching-rules/matching-engine';
import { TransactionEntity } from '../../../domain/entities/transaction.entity';
import { OrderEntity } from '../../../domain/entities/order.entity';
import {
  TransactionNotFoundDomainException,
  RedlockAcquisitionDomainException,
} from '../../../domain/exceptions/reconciliation-domain.exception';

export interface ReconcileTransactionResult {
  transactionId: string;
  orderId: string | null;
  matchResult: MatchResult;
}

@Injectable()
export class ReconcileTransactionHandler {
  private readonly logger = new Logger(ReconcileTransactionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redlockService: RedlockService,
  ) {}

  async execute(
    command: ReconcileTransactionCommand,
  ): Promise<ReconcileTransactionResult> {
    const { transactionId, customExchangeRate } = command;

    // 1. Fetch Transaction
    const txnRecord = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { order: true },
    });

    if (!txnRecord) {
      throw new TransactionNotFoundDomainException(transactionId);
    }

    const orderRecord = txnRecord.order;
    const lockResource = orderRecord ? `lock:order:${orderRecord.code}` : null;

    const reconcileAction = async (): Promise<ReconcileTransactionResult> => {
      // Convert Prisma models to Pure Domain Entities
      const txnEntity = new TransactionEntity(
        txnRecord.id,
        txnRecord.transactionCode,
        txnRecord.gateway,
        txnRecord.type,
        Number(txnRecord.amount),
        txnRecord.currency,
        Number(txnRecord.processingFee),
        Number(txnRecord.netAmount),
        Number(txnRecord.exchangeRate),
        Number(txnRecord.fxGainLoss),
        txnRecord.bankTimestamp,
        txnRecord.status,
        txnRecord.orderId,
        txnRecord.payoutId,
        txnRecord.rawPayload as Record<string, unknown>,
        txnRecord.createdAt,
      );

      const orderEntity = orderRecord
        ? new OrderEntity(
            orderRecord.id,
            orderRecord.code,
            Number(orderRecord.amount),
            orderRecord.currency,
            orderRecord.status,
            orderRecord.createdAt,
          )
        : null;

      // 3. Evaluate matching rules using Pure Domain MatchingEngine
      const matchResult = MatchingEngine.evaluate(
        txnEntity,
        orderEntity,
        customExchangeRate,
      );

      // 4. Update Database in a single Prisma Transaction
      await this.prisma.$transaction(async (tx) => {
        // Update Transaction status & fxGainLoss
        await tx.transaction.update({
          where: { id: transactionId },
          data: {
            status: matchResult.status,
            fxGainLoss: matchResult.fxGainLoss,
          },
        });

        // Update Order status if linked
        if (orderRecord && matchResult.orderStatus !== orderRecord.status) {
          await tx.order.update({
            where: { id: orderRecord.id },
            data: { status: matchResult.orderStatus },
          });
        }
      });

      this.logger.log(
        `Transaction ${transactionId} reconciled -> Status: ${matchResult.status} (Reason: ${matchResult.reason})`,
      );

      return {
        transactionId,
        orderId: orderRecord?.id ?? null,
        matchResult,
      };
    };

    // 2. Execute within Redlock if associated Order exists
    if (lockResource) {
      try {
        return await this.redlockService.executeWithLock(
          [lockResource],
          5000,
          reconcileAction,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to acquire or execute within Redlock for ${lockResource}: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new RedlockAcquisitionDomainException(lockResource);
      }
    }

    return await reconcileAction();
  }
}
