import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const csvParser = require('csv-parser') as (
  options?: Record<string, unknown>,
) => NodeJS.ReadWriteStream;

export interface RawBankStatementRow {
  referenceNo: string;
  amount: string;
  currency: string;
  bankTimestamp: string;
  description: string;
}

const BATCH_SIZE = 500;

@Injectable()
export class CsvStreamingService {
  private readonly logger = new Logger(CsvStreamingService.name);

  /**
   * Reads a CSV file as a stream and yields batches of BATCH_SIZE rows.
   * Memory usage is O(BATCH_SIZE) regardless of file size.
   */
  async *streamBatches(
    filePath: string,
  ): AsyncGenerator<RawBankStatementRow[]> {
    let batch: RawBankStatementRow[] = [];
    let totalRows = 0;

    const stream = fs.createReadStream(filePath).pipe(
      csvParser({
        mapHeaders: ({ header }: { header: string }) => header.trim(),
        mapValues: ({ value }: { value: unknown }) =>
          typeof value === 'string' ? value.trim() : value,
      }),
    );

    for await (const row of stream) {
      batch.push(row as unknown as RawBankStatementRow);
      totalRows++;

      if (batch.length >= BATCH_SIZE) {
        yield batch;
        batch = [];
      }
    }

    if (batch.length > 0) {
      yield batch;
    }

    this.logger.log(
      `CSV streaming complete. Total rows processed: ${totalRows}`,
    );
  }
}
