import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ReconcileBatchCommand } from '../impl/reconcile-batch.command';
import { RECONCILIATION_QUEUE } from '../../../../../shared/queue/queue.constants';

export interface ReconcileBatchResult {
  jobId: string;
}

@Injectable()
export class ReconcileBatchHandler {
  private readonly logger = new Logger(ReconcileBatchHandler.name);

  constructor(
    @InjectQueue(RECONCILIATION_QUEUE) private readonly queue: Queue,
  ) {}

  async execute(command: ReconcileBatchCommand): Promise<ReconcileBatchResult> {
    const job = await this.queue.add(
      'process-file',
      {
        filePath: command.filePath,
        fileType: command.fileType,
        uploadedBy: command.uploadedBy,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );

    this.logger.log(
      `Enqueued reconciliation job ${job.id} for file: ${command.filePath}`,
    );

    return { jobId: String(job.id) };
  }
}
