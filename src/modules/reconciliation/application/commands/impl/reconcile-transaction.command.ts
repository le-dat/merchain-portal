export class ReconcileTransactionCommand {
  constructor(
    public readonly transactionId: string,
    public readonly customExchangeRate?: number,
  ) {}
}
