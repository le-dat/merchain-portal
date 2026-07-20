export class BankStatementEntity {
  constructor(
    public readonly id: string,
    public readonly referenceNo: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly bankTimestamp: Date,
    public readonly description: string,
    public status: string,
    public readonly createdAt: Date,
  ) {}
}
