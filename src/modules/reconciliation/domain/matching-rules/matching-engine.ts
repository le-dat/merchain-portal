import { TransactionEntity } from '../entities/transaction.entity';
import { OrderEntity } from '../entities/order.entity';

export type MatchStatus =
  'MATCHED' | 'PARTIAL_MATCH' | 'SUSPICIOUS_MATCH' | 'REFUNDED';

export interface MatchResult {
  status: MatchStatus;
  orderStatus: string;
  fxGainLoss: number;
  reason: string;
}

export class MatchingEngine {
  /**
   * Evaluates reconciliation between a Transaction and an Order.
   * Pure domain logic without ORM or framework dependencies.
   *
   * @param txn The transaction received from gateway/webhook/bank
   * @param order The associated order entity (or null if unlinked)
   * @param exchangeRate Optional exchange rate (defaults to txn.exchangeRate or 1.0)
   */
  public static evaluate(
    txn: TransactionEntity,
    order: OrderEntity | null,
    exchangeRate?: number,
  ): MatchResult {
    // 1. Handle REFUND Transactions
    if (txn.type === 'REFUND') {
      return {
        status: 'REFUNDED',
        orderStatus: 'REFUNDED',
        fxGainLoss: 0,
        reason: `Transaction ${txn.transactionCode} processed as REFUND`,
      };
    }

    // 2. Handle missing Order
    if (!order) {
      return {
        status: 'SUSPICIOUS_MATCH',
        orderStatus: 'PENDING',
        fxGainLoss: 0,
        reason: `No associated order found for transaction ${txn.transactionCode}`,
      };
    }

    const effectiveRate = exchangeRate ?? txn.exchangeRate ?? 1.0;
    const convertedNetAmount = txn.netAmount * effectiveRate;
    const orderAmount = order.amount;
    const diff = Math.abs(convertedNetAmount - orderAmount);
    const percentageDiff = orderAmount > 0 ? (diff / orderAmount) * 100 : 100;

    // Calculate FX Gain / Loss:
    // Positive = Gain (received more in converted currency than expected),
    // Negative = Loss (received less due to rate fluctuation)
    const fxGainLoss =
      txn.currency !== order.currency
        ? Number((convertedNetAmount - orderAmount).toFixed(2))
        : 0;

    // 3. Exact Match (diff < 0.01 VND / USD)
    if (diff < 0.01) {
      return {
        status: 'MATCHED',
        orderStatus: 'PAID',
        fxGainLoss: 0,
        reason: 'Transaction net amount matches order amount exactly',
      };
    }

    // 4. Partial Match (small discrepancy <= 1% or FX rate variance)
    if (
      percentageDiff <= 1.0 ||
      (txn.currency !== order.currency && percentageDiff <= 5.0)
    ) {
      return {
        status: 'PARTIAL_MATCH',
        orderStatus:
          convertedNetAmount >= orderAmount ? 'PAID' : 'PARTIALLY_PAID',
        fxGainLoss,
        reason: `Minor amount discrepancy (${percentageDiff.toFixed(2)}%) within tolerance threshold`,
      };
    }

    // 5. Suspicious Match (> 1% discrepancy or severe mismatch)
    return {
      status: 'SUSPICIOUS_MATCH',
      orderStatus: order.status,
      fxGainLoss,
      reason: `Significant amount discrepancy (${percentageDiff.toFixed(2)}%) exceeds tolerance threshold`,
    };
  }
}
