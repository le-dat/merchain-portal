export class ProcessWebhookCommand {
  constructor(
    public readonly gateway: 'stripe' | 'vnpay',
    public readonly transactionCode: string,
    public readonly type: 'PAYMENT' | 'REFUND' | 'DISPUTE',
    public readonly amount: number,
    public readonly currency: string,
    public readonly status: string,
    public readonly bankTimestamp: Date,
    public readonly rawPayload: Record<string, unknown>,
    public readonly processingFee: number = 0,
    public readonly parentTransactionCode?: string,
    public readonly orderCode?: string,
  ) {}
}
