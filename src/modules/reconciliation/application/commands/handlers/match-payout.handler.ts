import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/database/prisma.service';
import { MatchPayoutCommand } from '../impl/match-payout.command';
import { PayoutMatcher } from '../../../domain/matching-rules/payout-matcher';
import { PayoutEntity } from '../../../domain/entities/payout.entity';
import { BankStatementEntity } from '../../../domain/entities/bank-statement.entity';
import { ReconciliationDomainException } from '../../../domain/exceptions/reconciliation-domain.exception';

export interface MatchPayoutResult {
  isMatched: boolean;
  payoutCode?: string;
  bankStatementId: string;
  settledTransactionsCount: number;
  reason: string;
}

@Injectable()
export class MatchPayoutHandler {
  private readonly logger = new Logger(MatchPayoutHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(command: MatchPayoutCommand): Promise<MatchPayoutResult> {
    const { bankStatementId } = command;

    // 1. Fetch BankStatement
    const statementRecord = await this.prisma.bankStatement.findUnique({
      where: { id: bankStatementId },
    });

    if (!statementRecord) {
      throw new ReconciliationDomainException(
        `Bank statement not found: ${bankStatementId}`,
      );
    }

    const statementEntity = new BankStatementEntity(
      statementRecord.id,
      statementRecord.referenceNo,
      Number(statementRecord.amount),
      statementRecord.currency,
      statementRecord.bankTimestamp,
      statementRecord.description,
      statementRecord.status,
      statementRecord.createdAt,
    );

    // 2. Extract Payout Code using Regex
    const extractedPayoutCode = PayoutMatcher.extractPayoutCode(
      statementEntity.description,
    );

    if (!extractedPayoutCode) {
      this.logger.warn(
        `No payout code pattern found in description for statement ${bankStatementId}`,
      );
      return {
        isMatched: false,
        bankStatementId,
        settledTransactionsCount: 0,
        reason:
          'No payout code pattern (po_*, VNPAY_*, BATCH_*) found in statement description',
      };
    }

    // 3. Fetch Payout from DB
    const payoutRecord = await this.prisma.payout.findUnique({
      where: { payoutCode: extractedPayoutCode },
    });

    if (!payoutRecord) {
      this.logger.warn(
        `Payout record with code ${extractedPayoutCode} not found in database`,
      );
      return {
        isMatched: false,
        payoutCode: extractedPayoutCode,
        bankStatementId,
        settledTransactionsCount: 0,
        reason: `Payout with code '${extractedPayoutCode}' not found in database`,
      };
    }

    const payoutEntity = new PayoutEntity(
      payoutRecord.id,
      payoutRecord.payoutCode,
      payoutRecord.gateway,
      Number(payoutRecord.amount),
      payoutRecord.currency,
      Number(payoutRecord.processingFee),
      payoutRecord.bankAccountNo,
      payoutRecord.status,
      payoutRecord.bankStatementId,
      payoutRecord.bankTimestamp,
      payoutRecord.rawPayload as Record<string, unknown>,
      payoutRecord.createdAt,
    );

    // 4. Evaluate Payout Match
    const matchResult = PayoutMatcher.evaluate(payoutEntity, statementEntity);

    if (!matchResult.isMatched) {
      this.logger.warn(`Payout match failed: ${matchResult.reason}`);
      return {
        isMatched: false,
        payoutCode: extractedPayoutCode,
        bankStatementId,
        settledTransactionsCount: 0,
        reason: matchResult.reason,
      };
    }

    // 5. Execute Atomic Database Updates inside a Single Prisma Transaction
    let settledCount = 0;
    await this.prisma.$transaction(async (tx) => {
      // Update Payout -> SETTLED
      await tx.payout.update({
        where: { id: payoutEntity.id },
        data: {
          status: 'SETTLED',
          bankStatementId: statementEntity.id,
          bankTimestamp: statementEntity.bankTimestamp,
        },
      });

      // Update BankStatement -> SETTLED
      await tx.bankStatement.update({
        where: { id: statementEntity.id },
        data: { status: 'SETTLED' },
      });

      // Bulk update all associated transactions -> SETTLED in milliseconds
      const updateResult = await tx.transaction.updateMany({
        where: {
          payoutId: payoutEntity.id,
          status: 'MATCHED',
        },
        data: { status: 'SETTLED' },
      });

      settledCount = updateResult.count;
    });

    this.logger.log(
      `Successfully matched Payout ${extractedPayoutCode} with Statement ${statementRecord.referenceNo}. Settled ${settledCount} transactions.`,
    );

    return {
      isMatched: true,
      payoutCode: extractedPayoutCode,
      bankStatementId,
      settledTransactionsCount: settledCount,
      reason: matchResult.reason,
    };
  }
}
