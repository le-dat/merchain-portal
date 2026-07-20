export class ReconcileBatchCommand {
  constructor(
    public readonly filePath: string,
    public readonly fileType: 'csv' | 'xlsx',
    public readonly uploadedBy: string,
  ) {}
}
