export class ReconciliationDomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReconciliationDomainException';
  }
}

export class OrderNotFoundDomainException extends ReconciliationDomainException {
  constructor(orderCodeOrId: string) {
    super(`Order not found: ${orderCodeOrId}`);
    this.name = 'OrderNotFoundDomainException';
  }
}

export class TransactionNotFoundDomainException extends ReconciliationDomainException {
  constructor(transactionId: string) {
    super(`Transaction not found: ${transactionId}`);
    this.name = 'TransactionNotFoundDomainException';
  }
}

export class RedlockAcquisitionDomainException extends ReconciliationDomainException {
  constructor(resourceKey: string) {
    super(`Failed to acquire distributed Redlock for resource: ${resourceKey}`);
    this.name = 'RedlockAcquisitionDomainException';
  }
}
