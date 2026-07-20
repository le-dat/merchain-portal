import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { RawBankStatementRow } from './csv-streaming.service';

const BATCH_SIZE = 500;

@Injectable()
export class ExcelStreamingService {
  private readonly logger = new Logger(ExcelStreamingService.name);

  /**
   * Reads an XLSX file using ExcelJS streaming (SAX-based) reader.
   * Yields batches of BATCH_SIZE rows. Memory usage is O(BATCH_SIZE).
   */
  async *streamBatches(
    filePath: string,
  ): AsyncGenerator<RawBankStatementRow[]> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
      sharedStrings: 'cache',
      hyperlinks: 'ignore',
      styles: 'ignore',
      worksheets: 'emit',
    });

    let batch: RawBankStatementRow[] = [];
    let totalRows = 0;
    let headers: string[] = [];
    let isFirstRow = true;

    for await (const worksheetReader of workbook) {
      for await (const row of worksheetReader) {
        const values = (row.values as (string | number | null | undefined)[])
          .slice(1) // ExcelJS row.values[0] is always undefined
          .map((v) => (v == null ? '' : String(v).trim()));

        if (isFirstRow) {
          headers = values;
          isFirstRow = false;
          continue;
        }

        const mapped: RawBankStatementRow = {
          referenceNo: values[headers.indexOf('referenceNo')] ?? '',
          amount: values[headers.indexOf('amount')] ?? '',
          currency: values[headers.indexOf('currency')] ?? 'VND',
          bankTimestamp: values[headers.indexOf('bankTimestamp')] ?? '',
          description: values[headers.indexOf('description')] ?? '',
        };

        batch.push(mapped);
        totalRows++;

        if (batch.length >= BATCH_SIZE) {
          yield batch;
          batch = [];
        }
      }
    }

    if (batch.length > 0) {
      yield batch;
    }

    this.logger.log(
      `Excel streaming complete. Total rows processed: ${totalRows}`,
    );
  }
}
