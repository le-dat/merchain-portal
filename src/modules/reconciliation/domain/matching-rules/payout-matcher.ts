import { PayoutEntity } from '../entities/payout.entity';
import { BankStatementEntity } from '../entities/bank-statement.entity';

export interface PayoutMatchResult {
  isMatched: boolean;
  reason: string;
}

export class PayoutMatcher {
  // Regex pattern matching Stripe payout codes (po_*) or VNPay / Batch codes (VNPAY_*, BATCH_*, PO_*)
  private static readonly PAYOUT_CODE_REGEX =
    /(po_[a-zA-Z0-9]+|VNPAY_[a-zA-Z0-9_]+|BATCH_[a-zA-Z0-9_]+|PO_[a-zA-Z0-9_]+)/i;

  /**
   * Extracts payout code from bank statement description string using Regex.
   */
  public static extractPayoutCode(description: string): string | null {
    if (!description) return null;
    const match = this.PAYOUT_CODE_REGEX.exec(description);
    return match ? match[1] : null;
  }

  /**
   * Evaluates if a Payout matches a BankStatement.
   * Matches if Payout code matches extracted code AND amounts match within 0.01 tolerance.
   */
  public static evaluate(
    payout: PayoutEntity,
    statement: BankStatementEntity,
  ): PayoutMatchResult {
    const extractedCode = this.extractPayoutCode(statement.description);

    if (
      !extractedCode ||
      extractedCode.toLowerCase() !== payout.payoutCode.toLowerCase()
    ) {
      return {
        isMatched: false,
        reason: `Payout code mismatch. Statement extracted '${extractedCode}', payout code is '${payout.payoutCode}'`,
      };
    }

    const amountDiff = Math.abs(payout.amount - statement.amount);
    if (amountDiff >= 0.01) {
      return {
        isMatched: false,
        reason: `Amount mismatch. Payout amount ${payout.amount} vs statement amount ${statement.amount} (Diff: ${amountDiff})`,
      };
    }

    if (payout.currency.toUpperCase() !== statement.currency.toUpperCase()) {
      return {
        isMatched: false,
        reason: `Currency mismatch. Payout currency ${payout.currency} vs statement currency ${statement.currency}`,
      };
    }

    return {
      isMatched: true,
      reason: `Payout ${payout.payoutCode} matches bank statement ${statement.referenceNo} exactly`,
    };
  }
}
