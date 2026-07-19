import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import ExcelJS from 'exceljs';
import { faker } from '@faker-js/faker';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const TOTAL_ROWS = 10_000;
const MATCHED_COUNT = 8_000;
const PARTIAL_COUNT = 1_000;
// remaining 1,000 rows are UNMATCHED (fake codes)

const OUTPUT_DIR = path.resolve(__dirname, '../temp');

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is missing');
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function randomAmount(base: number, variance: number): string {
  return (base + (Math.random() - 0.5) * variance).toFixed(2);
}

function stripeFee(amount: number): string {
  return (amount * 0.029 + 0.3).toFixed(2);
}

function stripePayoutCode(): string {
  return `po_${faker.string.alphanumeric({ length: 14, casing: 'mixed' })}`;
}

function vnpayBatchCode(): string {
  return `VNP_BATCH_${faker.string.numeric(8)}`;
}

function isoTimestamp(): string {
  return faker.date.recent({ days: 30 }).toISOString();
}

// ---------------------------------------------------------------------------
// 1. Fetch random order codes from DB
// ---------------------------------------------------------------------------
async function fetchRandomOrderCodes(count: number): Promise<string[]> {
  console.log(`Fetching ${count} random order codes from DB...`);
  const result = await prisma.$queryRaw<{ code: string }[]>`
    SELECT code FROM orders ORDER BY RANDOM() LIMIT ${count}
  `;
  console.log(`Fetched ${result.length} order codes.`);
  return result.map((r) => r.code);
}

// ---------------------------------------------------------------------------
// 2. Generate Stripe Payout CSV
// ---------------------------------------------------------------------------
async function generateStripeCSV(
  orderCodes: string[],
  payoutCodes: string[],
): Promise<void> {
  const outputPath = path.join(OUTPUT_DIR, 'stripe_payout_10k.csv');
  const writer = createObjectCsvWriter({
    path: outputPath,
    header: [
      { id: 'id', title: 'id' },
      { id: 'type', title: 'type' },
      { id: 'amount', title: 'amount' },
      { id: 'fee', title: 'fee' },
      { id: 'net', title: 'net' },
      { id: 'currency', title: 'currency' },
      { id: 'order_id', title: 'order_id' },
      { id: 'payout_id', title: 'payout_id' },
      { id: 'bank_timestamp', title: 'bank_timestamp' },
    ],
  });

  const types = ['PAYMENT', 'REFUND', 'DISPUTE'];
  const records: Record<string, string>[] = [];

  for (let i = 0; i < TOTAL_ROWS; i++) {
    const baseAmount = parseFloat(randomAmount(200, 300));
    const fee = parseFloat(stripeFee(baseAmount));

    let orderCode: string;
    let amount: string;

    if (i < MATCHED_COUNT) {
      orderCode = orderCodes[i];
      amount = baseAmount.toFixed(2);
    } else if (i < MATCHED_COUNT + PARTIAL_COUNT) {
      orderCode = orderCodes[i];
      amount = (baseAmount * (0.95 + Math.random() * 0.04)).toFixed(2);
    } else {
      orderCode = `ORD-X${i.toString().padStart(5, '0')}`;
      amount = baseAmount.toFixed(2);
    }

    const net = (parseFloat(amount) - fee).toFixed(2);

    records.push({
      id: `txn_${faker.string.alphanumeric({ length: 14, casing: 'mixed' })}`,
      type: types[i % 3],
      amount,
      fee: fee.toFixed(2),
      net,
      currency: 'USD',
      order_id: orderCode,
      payout_id: payoutCodes[i % payoutCodes.length],
      bank_timestamp: isoTimestamp(),
    });
  }

  await writer.writeRecords(records);
  console.log(`Generated: ${outputPath}`);
}

// ---------------------------------------------------------------------------
// 3. Generate VNPay Settlement XLSX
// ---------------------------------------------------------------------------
async function generateVNPayXLSX(
  orderCodes: string[],
): Promise<string[]> {
  const outputPath = path.join(OUTPUT_DIR, 'vnpay_settlement_10k.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Settlement');

  sheet.columns = [
    { header: 'vnp_TxnRef', key: 'vnp_TxnRef', width: 20 },
    { header: 'vnp_Amount', key: 'vnp_Amount', width: 16 },
    { header: 'vnp_BankCode', key: 'vnp_BankCode', width: 14 },
    { header: 'vnp_PayDate', key: 'vnp_PayDate', width: 20 },
    { header: 'vnp_TransactionNo', key: 'vnp_TransactionNo', width: 20 },
    { header: 'vnp_ResponseCode', key: 'vnp_ResponseCode', width: 16 },
    { header: 'batch_code', key: 'batch_code', width: 22 },
  ];

  const batchCodes: string[] = [];
  const banks = ['VCB', 'TCB', 'MBB', 'ACB', 'BIDV'];

  for (let i = 0; i < TOTAL_ROWS; i++) {
    const baseAmount = Math.round(faker.number.float({ min: 50000, max: 5000000 }));
    const batchCode = vnpayBatchCode();
    batchCodes.push(batchCode);

    let txnRef: string;
    let amount: number;

    if (i < MATCHED_COUNT) {
      txnRef = orderCodes[i];
      amount = baseAmount;
    } else if (i < MATCHED_COUNT + PARTIAL_COUNT) {
      txnRef = orderCodes[i];
      amount = Math.round(baseAmount * (0.95 + Math.random() * 0.04));
    } else {
      txnRef = `ORD-X${i.toString().padStart(5, '0')}`;
      amount = baseAmount;
    }

    sheet.addRow({
      vnp_TxnRef: txnRef,
      vnp_Amount: amount,
      vnp_BankCode: banks[i % banks.length],
      vnp_PayDate: faker.date.recent({ days: 30 }).toISOString().replace(/[-:T.Z]/g, '').slice(0, 14),
      vnp_TransactionNo: faker.string.numeric(12),
      vnp_ResponseCode: '00',
      batch_code: batchCode,
    });
  }

  await workbook.xlsx.writeFile(outputPath);
  console.log(`Generated: ${outputPath}`);
  return batchCodes;
}

// ---------------------------------------------------------------------------
// 4. Generate Bank Statement CSV
// ---------------------------------------------------------------------------
async function generateBankStatementCSV(
  stripeCodes: string[],
  vnpayCodes: string[],
): Promise<void> {
  const outputPath = path.join(OUTPUT_DIR, 'bank_statement_10k.csv');
  const writer = createObjectCsvWriter({
    path: outputPath,
    header: [
      { id: 'reference_no', title: 'reference_no' },
      { id: 'amount', title: 'amount' },
      { id: 'currency', title: 'currency' },
      { id: 'bank_timestamp', title: 'bank_timestamp' },
      { id: 'description', title: 'description' },
    ],
  });

  const records: Record<string, string>[] = [];
  const allPayoutCodes = [...stripeCodes, ...vnpayCodes];

  for (let i = 0; i < TOTAL_ROWS; i++) {
    const payoutCode = allPayoutCodes[i % allPayoutCodes.length];
    const amount = (faker.number.float({ min: 10000, max: 50000000 })).toFixed(2);
    const currency = i % 2 === 0 ? 'VND' : 'USD';

    records.push({
      reference_no: `REF${faker.string.numeric(10)}`,
      amount,
      currency,
      bank_timestamp: isoTimestamp(),
      description: `TRANSFER CREDIT ${payoutCode} MERCHAIN LTD`,
    });
  }

  await writer.writeRecords(records);
  console.log(`Generated: ${outputPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Starting mock test file generation...\n');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const orderCodes = await fetchRandomOrderCodes(TOTAL_ROWS);

  // Build payout codes once, reuse across files so bank statement can cross-reference
  const stripePayoutCodes = Array.from({ length: 100 }, stripePayoutCode);
  const vnpayBatchCodes: string[] = [];

  await generateStripeCSV(orderCodes, stripePayoutCodes);
  const vnpayCodes = await generateVNPayXLSX(orderCodes);
  vnpayBatchCodes.push(...vnpayCodes.slice(0, 100));

  await generateBankStatementCSV(stripePayoutCodes, vnpayBatchCodes);

  console.log('\nAll mock test files generated successfully!');
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

main()
  .catch((e) => {
    console.error('Error generating test files:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
