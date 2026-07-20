export class PayoutEntity {
  constructor(
    public readonly id: string,
    public readonly payoutCode: string,
    public readonly gateway: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly processingFee: number,
    public readonly bankAccountNo: string,
    public status: string,
    public bankStatementId: string | null,
    public bankTimestamp: Date | null,
    public readonly rawPayload: Record<string, unknown>,
    public readonly createdAt: Date,
  ) {}
}
