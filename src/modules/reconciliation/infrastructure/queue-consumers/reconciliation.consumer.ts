import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as fs from 'fs';
import { RECONCILIATION_QUEUE } from '../../../../shared/queue/queue.constants';
import { CsvStreamingService } from '../streaming/csv-streaming.service';
import { ExcelStreamingService } from '../streaming/excel-streaming.service';
import {
  type ITransactionRepository,
  TRANSACTION_REPOSITORY,
} from '../../application/ports/db/transaction-repository.port';
import { BankStatementEntity } from '../../domain/entities/bank-statement.entity';

export interface ReconciliationJobPayload {
  filePath: string;
  fileType: 'csv' | 'xlsx';
  uploadedBy: string;
}

@Processor(RECONCILIATION_QUEUE)
export class ReconciliationConsumer extends WorkerHost {
  private readonly logger = new Logger(ReconciliationConsumer.name);

  constructor(
    private readonly csvService: CsvStreamingService,
    private readonly excelService: ExcelStreamingService,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly txnRepository: ITransactionRepository,
  ) {
    super();
  }

  async process(job: Job<ReconciliationJobPayload>): Promise<void> {
    const { filePath, fileType, uploadedBy } = job.data;

    this.logger.log(
      `Processing job ${job.id} | file: ${filePath} | type: ${fileType} | by: ${uploadedBy}`,
    );

    try {
      const batchStream =
        fileType === 'csv'
          ? this.csvService.streamBatches(filePath)
          : this.excelService.streamBatches(filePath);

      let totalProcessed = 0;
      let batchIndex = 0;

      for await (const rawBatch of batchStream) {
        const entities: BankStatementEntity[] = rawBatch.map(
          (row) =>
            new BankStatementEntity(
              '',
              row.referenceNo,
              parseFloat(row.amount) || 0,
              row.currency || 'VND',
              new Date(row.bankTimestamp),
              row.description,
              'UNMATCHED',
              new Date(),
            ),
        );

        await this.txnRepository.upsertBankStatementBatch(entities);
        totalProcessed += entities.length;
        batchIndex++;

        await job.updateProgress(
          Math.round((batchIndex / (batchIndex + 1)) * 100),
        );

        this.logger.debug(
          `Job ${job.id}: batch #${batchIndex} done (${totalProcessed} rows total)`,
        );
      }

      this.logger.log(
        `Job ${job.id} completed. Total rows upserted: ${totalProcessed}`,
      );
    } finally {
      this.cleanupFile(filePath);
    }
  }

  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.debug(`Temp file deleted: ${filePath}`);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to delete temp file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
