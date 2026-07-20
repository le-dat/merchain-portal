import { PayoutMatcher } from './payout-matcher';
import { PayoutEntity } from '../entities/payout.entity';
import { BankStatementEntity } from '../entities/bank-statement.entity';

describe('PayoutMatcher (Pure Domain Unit Tests)', () => {
  const createPayout = (
    overrides: Partial<PayoutEntity> = {},
  ): PayoutEntity => {
    return new PayoutEntity(
      overrides.id ?? 'payout-123',
      overrides.payoutCode ?? 'po_US100234',
      overrides.gateway ?? 'stripe',
      overrides.amount ?? 50000.0,
      overrides.currency ?? 'USD',
      overrides.processingFee ?? 10.0,
      overrides.bankAccountNo ?? 'ACC_998877',
      overrides.status ?? 'TRANSIT',
      overrides.bankStatementId ?? null,
      overrides.bankTimestamp ?? null,
      overrides.rawPayload ?? {},
      overrides.createdAt ?? new Date(),
    );
  };

  const createStatement = (
    overrides: Partial<BankStatementEntity> = {},
  ): BankStatementEntity => {
    return new BankStatementEntity(
      overrides.id ?? 'stmt-123',
      overrides.referenceNo ?? 'REF_STATEMENT_001',
      overrides.amount ?? 50000.0,
      overrides.currency ?? 'USD',
      overrides.bankTimestamp ?? new Date(),
      overrides.description ?? 'REF: po_US100234 NET: 50000.00',
      overrides.status ?? 'UNMATCHED',
      overrides.createdAt ?? new Date(),
    );
  };

  describe('extractPayoutCode', () => {
    it('should extract Stripe payout code (po_*) from statement description', () => {
      const code = PayoutMatcher.extractPayoutCode(
        'STRIPE PAYOUT REF: po_1N3x4y2eZvKYlo2C NET AMOUNT 5000',
      );
      expect(code).toBe('po_1N3x4y2eZvKYlo2C');
    });

    it('should extract VNPay payout batch code (VNPAY_*) from statement description', () => {
      const code = PayoutMatcher.extractPayoutCode(
        'CONG TY VNPAY CHUYEN TIEN VNPAY_BATCH_20260720 TRUNG THU',
      );
      expect(code).toBe('VNPAY_BATCH_20260720');
    });

    it('should extract generic batch code (BATCH_*) from statement description', () => {
      const code = PayoutMatcher.extractPayoutCode(
        'SAO KE NGAN HANG BATCH_998877 SO TIEN 1000000',
      );
      expect(code).toBe('BATCH_998877');
    });

    it('should return null when description does not contain payout code pattern', () => {
      const code = PayoutMatcher.extractPayoutCode(
        'CHUYEN TIEN CA NHAN NGUYEN VAN A TIEN NHA',
      );
      expect(code).toBeNull();
    });
  });

  describe('evaluate', () => {
    it('should return isMatched: true when payout code and amount match exactly', () => {
      const payout = createPayout({
        payoutCode: 'po_US100234',
        amount: 50000.0,
      });
      const statement = createStatement({
        description: 'REF: po_US100234 NET: 50000.00',
        amount: 50000.0,
      });

      const result = PayoutMatcher.evaluate(payout, statement);

      expect(result.isMatched).toBe(true);
      expect(result.reason).toContain('matches bank statement');
    });

    it('should return isMatched: false when payout codes mismatch', () => {
      const payout = createPayout({ payoutCode: 'po_US100234' });
      const statement = createStatement({
        description: 'REF: po_DIFFERENT_CODE NET: 50000.00',
      });

      const result = PayoutMatcher.evaluate(payout, statement);

      expect(result.isMatched).toBe(false);
      expect(result.reason).toContain('Payout code mismatch');
    });

    it('should return isMatched: false when payout amounts mismatch', () => {
      const payout = createPayout({
        payoutCode: 'po_US100234',
        amount: 50000.0,
      });
      const statement = createStatement({
        description: 'REF: po_US100234 NET: 45000.00',
        amount: 45000.0,
      });

      const result = PayoutMatcher.evaluate(payout, statement);

      expect(result.isMatched).toBe(false);
      expect(result.reason).toContain('Amount mismatch');
    });

    it('should return isMatched: false when currencies mismatch', () => {
      const payout = createPayout({
        payoutCode: 'po_US100234',
        currency: 'USD',
      });
      const statement = createStatement({
        description: 'REF: po_US100234 NET: 50000.00',
        currency: 'VND',
      });

      const result = PayoutMatcher.evaluate(payout, statement);

      expect(result.isMatched).toBe(false);
      expect(result.reason).toContain('Currency mismatch');
    });
  });
});
