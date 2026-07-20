export class OrderEntity {
  constructor(
    public readonly id: string,
    public readonly code: string,
    public readonly amount: number,
    public readonly currency: string,
    public status: string,
    public readonly createdAt: Date,
  ) {}
}
