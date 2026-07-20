import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

// Application Commands
import { ReconcileBatchHandler } from './application/commands/handlers/reconcile-batch.handler';
import { ProcessWebhookHandler } from './application/commands/handlers/process-webhook.handler';

// Infrastructure - Gateways
import { StripeClientService } from './infrastructure/gateways/stripe.client';
import { VNPayClientService } from './infrastructure/gateways/vnpay.client';

// Infrastructure - Streaming
import { CsvStreamingService } from './infrastructure/streaming/csv-streaming.service';
import { ExcelStreamingService } from './infrastructure/streaming/excel-streaming.service';

// Infrastructure - Repositories
import { PrismaTxnRepository } from './infrastructure/repositories/prisma-txn.repository';
import { PrismaOrderRepository } from './infrastructure/repositories/prisma-order.repository';
import { TRANSACTION_REPOSITORY } from './application/ports/db/transaction-repository.port';
import { ORDER_REPOSITORY } from './application/ports/db/order-repository.port';

// Infrastructure - Consumer
import { ReconciliationConsumer } from './infrastructure/queue-consumers/reconciliation.consumer';

// Presentation Controllers & Webhooks
import { ReconciliationController } from './presentation/controllers/reconciliation.controller';
import { DashboardController } from './presentation/controllers/dashboard.controller';
import { StripeWebhookController } from './presentation/webhooks/stripe-webhook.controller';
import { VNPayIpnController } from './presentation/webhooks/vnpay-ipn.controller';

// Worker legacy (kept for compatibility)
import { WorkerService } from './worker.service';

// Constants
import { RECONCILIATION_QUEUE } from '../../shared/queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: RECONCILIATION_QUEUE })],
  controllers: [
    ReconciliationController,
    DashboardController,
    StripeWebhookController,
    VNPayIpnController,
  ],
  providers: [
    // Application Command Handlers
    ReconcileBatchHandler,
    ProcessWebhookHandler,

    // Infrastructure - Gateways
    StripeClientService,
    VNPayClientService,

    // Infrastructure - Streaming
    CsvStreamingService,
    ExcelStreamingService,

    // Infrastructure - Consumer
    ReconciliationConsumer,

    // Infrastructure - Repository bindings (port → implementation)
    {
      provide: TRANSACTION_REPOSITORY,
      useClass: PrismaTxnRepository,
    },
    {
      provide: ORDER_REPOSITORY,
      useClass: PrismaOrderRepository,
    },

    // Legacy worker service
    WorkerService,
  ],
  exports: [WorkerService],
})
export class ReconciliationModule {}
