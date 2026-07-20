import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { type ITransactionRepository } from '../../application/ports/db/transaction-repository.port';
import { BankStatementEntity } from '../../domain/entities/bank-statement.entity';

@Injectable()
export class PrismaTxnRepository implements ITransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upserts a batch of bank statement rows in a single transaction.
   * Uses createMany with skipDuplicates to avoid N+1 queries.
   */
  async upsertBankStatementBatch(rows: BankStatementEntity[]): Promise<void> {
    const data = rows.map((row) => ({
      referenceNo: row.referenceNo,
      amount: row.amount,
      currency: row.currency,
      bankTimestamp: row.bankTimestamp,
      description: row.description,
      status: row.status,
    }));

    await this.prisma.$transaction([
      this.prisma.bankStatement.createMany({
        data,
        skipDuplicates: true,
      }),
    ]);
  }
}
