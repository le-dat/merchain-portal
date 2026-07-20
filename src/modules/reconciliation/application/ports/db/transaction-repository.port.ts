import { BankStatementEntity } from '../../../domain/entities/bank-statement.entity';

export const TRANSACTION_REPOSITORY = Symbol('ITransactionRepository');

export interface ITransactionRepository {
  upsertBankStatementBatch(rows: BankStatementEntity[]): Promise<void>;
}
