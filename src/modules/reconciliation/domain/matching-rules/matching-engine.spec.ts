import { MatchingEngine } from './matching-engine';
import { TransactionEntity } from '../entities/transaction.entity';
import { OrderEntity } from '../entities/order.entity';

describe('MatchingEngine (Pure Domain Unit Tests)', () => {
  const createTxn = (
    overrides: Partial<TransactionEntity> = {},
  ): TransactionEntity => {
    return new TransactionEntity(
      overrides.id ?? 'txn-123',
      overrides.transactionCode ?? 'TXN_001',
      overrides.gateway ?? 'stripe',
      overrides.type ?? 'PAYMENT',
      overrides.amount ?? 100,
      overrides.currency ?? 'VND',
      overrides.processingFee ?? 0,
      overrides.netAmount ?? 100,
      overrides.exchangeRate ?? 1.0,
      overrides.fxGainLoss ?? 0,
      overrides.bankTimestamp ?? new Date(),
      overrides.status ?? 'SUCCESS',
      overrides.orderId ?? 'order-123',
      overrides.payoutId ?? null,
      overrides.rawPayload ?? {},
      overrides.createdAt ?? new Date(),
    );
  };

  const createOrder = (overrides: Partial<OrderEntity> = {}): OrderEntity => {
    return new OrderEntity(
      overrides.id ?? 'order-123',
      overrides.code ?? 'ORD_001',
      overrides.amount ?? 100,
      overrides.currency ?? 'VND',
      overrides.status ?? 'PENDING',
      overrides.createdAt ?? new Date(),
    );
  };

  it('should return MATCHED when net amount matches order amount exactly', () => {
    const txn = createTxn({ netAmount: 500000, currency: 'VND' });
    const order = createOrder({ amount: 500000, currency: 'VND' });

    const result = MatchingEngine.evaluate(txn, order);

    expect(result.status).toBe('MATCHED');
    expect(result.orderStatus).toBe('PAID');
    expect(result.fxGainLoss).toBe(0);
    expect(result.reason).toContain('matches order amount exactly');
  });

  it('should return PARTIAL_MATCH when discrepancy is within 1% tolerance threshold', () => {
    const txn = createTxn({ netAmount: 99.5, currency: 'USD' });
    const order = createOrder({ amount: 100, currency: 'USD' });

    const result = MatchingEngine.evaluate(txn, order);

    expect(result.status).toBe('PARTIAL_MATCH');
    expect(result.orderStatus).toBe('PARTIALLY_PAID');
    expect(result.reason).toContain('within tolerance threshold');
  });

  it('should return PARTIAL_MATCH and calculate fxGainLoss when currencies differ', () => {
    // Order amount = 2,500,000 VND. Txn netAmount = 100 USD. Custom rate = 25,400 VND/USD
    // Converted netAmount = 100 * 25,400 = 2,540,000 VND
    // fxGainLoss = 2,540,000 - 2,500,000 = +40,000 VND (Gain)
    const txn = createTxn({ netAmount: 100, currency: 'USD' });
    const order = createOrder({ amount: 2500000, currency: 'VND' });

    const result = MatchingEngine.evaluate(txn, order, 25400);

    expect(result.status).toBe('PARTIAL_MATCH');
    expect(result.orderStatus).toBe('PAID');
    expect(result.fxGainLoss).toBe(40000);
  });

  it('should return SUSPICIOUS_MATCH when amount discrepancy exceeds 1% tolerance', () => {
    const txn = createTxn({ netAmount: 50, currency: 'USD' }); // 50% underpaid
    const order = createOrder({ amount: 100, currency: 'USD' });

    const result = MatchingEngine.evaluate(txn, order);

    expect(result.status).toBe('SUSPICIOUS_MATCH');
    expect(result.orderStatus).toBe('PENDING');
    expect(result.reason).toContain('exceeds tolerance threshold');
  });

  it('should return SUSPICIOUS_MATCH when no order is provided', () => {
    const txn = createTxn({ netAmount: 100 });

    const result = MatchingEngine.evaluate(txn, null);

    expect(result.status).toBe('SUSPICIOUS_MATCH');
    expect(result.orderStatus).toBe('PENDING');
    expect(result.reason).toContain('No associated order found');
  });

  it('should return REFUNDED status for REFUND transaction types', () => {
    const txn = createTxn({ type: 'REFUND', netAmount: 100 });
    const order = createOrder({ amount: 100 });

    const result = MatchingEngine.evaluate(txn, order);

    expect(result.status).toBe('REFUNDED');
    expect(result.orderStatus).toBe('REFUNDED');
    expect(result.reason).toContain('processed as REFUND');
  });
});
