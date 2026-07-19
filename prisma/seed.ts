import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is missing');
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting database seeding...');

  // 1. Clean existing database records in dependency order
  console.log('Cleaning existing data...');
  await prisma.transaction.deleteMany({});
  await prisma.payout.deleteMany({});
  await prisma.bankStatement.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.user.deleteMany({});

  // 2. Create sample users
  console.log('Seeding sample users...');
  const defaultPassword = 'password123';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@merchain.com',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });
  console.log(`Seeded Admin: ${admin.email}`);

  const accountant = await prisma.user.create({
    data: {
      email: 'accountant@merchain.com',
      password: hashedPassword,
      role: 'ACCOUNTANT',
    },
  });
  console.log(`Seeded Accountant: ${accountant.email}`);

  // 3. Create 500,000 orders in batches
  console.log('Seeding 500,000 orders in batches of 10,000...');
  const TOTAL_ORDERS = 500000;
  const BATCH_SIZE = 10000;

  for (let i = 0; i < TOTAL_ORDERS; i += BATCH_SIZE) {
    const ordersBatch: Prisma.OrderCreateManyInput[] = [];
    for (let j = 0; j < BATCH_SIZE; j++) {
      const orderIndex = i + j + 1;
      const rawAmount = (Math.random() * 5000 + 10).toFixed(2);
      ordersBatch.push({
        code: `ORD-${orderIndex.toString().padStart(6, '0')}`,
        amount: rawAmount,
        currency: orderIndex % 2 === 0 ? 'VND' : 'USD',
        status: 'PENDING',
      });
    }

    await prisma.order.createMany({
      data: ordersBatch,
    });

    if ((i + BATCH_SIZE) % 50000 === 0 || i + BATCH_SIZE === TOTAL_ORDERS) {
      console.log(`Seeded ${i + BATCH_SIZE} / ${TOTAL_ORDERS} orders`);
    }
  }

  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
