export class TransactionEntity {
  constructor(
    public readonly id: string,
    public readonly transactionCode: string,
    public readonly gateway: string,
    public readonly type: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly processingFee: number,
    public readonly netAmount: number,
    public readonly exchangeRate: number,
    public readonly fxGainLoss: number,
    public readonly bankTimestamp: Date,
    public status: string,
    public readonly orderId: string | null,
    public readonly payoutId: string | null,
    public readonly rawPayload: Record<string, unknown>,
    public readonly createdAt: Date,
  ) {}
}
