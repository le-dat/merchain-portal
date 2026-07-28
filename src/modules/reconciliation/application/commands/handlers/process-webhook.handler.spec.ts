/* eslint-disable @typescript-eslint/unbound-method */
import { ProcessWebhookHandler } from './process-webhook.handler';
import { ProcessWebhookCommand } from '../impl/process-webhook.command';
import { PrismaService } from '../../../../../shared/database/prisma.service';
import { Prisma } from '@prisma/client';

describe('ProcessWebhookHandler', () => {
  let handler: ProcessWebhookHandler;
  let prismaService: jest.Mocked<PrismaService>;

  beforeEach(() => {
    prismaService = {
      transaction: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    handler = new ProcessWebhookHandler(prismaService);
  });

  const sampleCommand = new ProcessWebhookCommand(
    'stripe',
    'pi_test_123',
    'PAYMENT',
    100,
    'USD',
    'SUCCESS',
    new Date(),
    { id: 'pi_test_123' },
    0,
    undefined,
    'ORD-001',
  );

  it('should return ALREADY_PROCESSED if transaction exists on initial check', async () => {
    (prismaService.transaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'existing-id-123',
      transactionCode: 'pi_test_123',
    });

    const result = await handler.execute(sampleCommand);

    expect(result).toEqual({
      status: 'ALREADY_PROCESSED',
      transactionId: 'existing-id-123',
    });
    expect(prismaService.transaction.create).not.toHaveBeenCalled();
  });

  it('should process and create transaction successfully if new', async () => {
    (prismaService.transaction.findFirst as jest.Mock).mockResolvedValueOnce(
      null,
    );
    (prismaService.order.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'ord-db-id',
      code: 'ORD-001',
    });
    (prismaService.transaction.create as jest.Mock).mockResolvedValueOnce({
      id: 'new-txn-id',
      transactionCode: 'pi_test_123',
    });

    const result = await handler.execute(sampleCommand);

    expect(result).toEqual({
      status: 'PROCESSED',
      transactionId: 'new-txn-id',
    });
    expect(prismaService.transaction.create).toHaveBeenCalled();
  });

  it('should handle Prisma P2002 unique constraint violation gracefully and return ALREADY_PROCESSED', async () => {
    (prismaService.transaction.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // First check passes (race condition)
      .mockResolvedValueOnce({ id: 'concurrent-txn-id' }); // Second check after P2002

    (prismaService.order.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '5.0.0',
      },
    );

    (prismaService.transaction.create as jest.Mock).mockRejectedValueOnce(
      p2002Error,
    );

    const result = await handler.execute(sampleCommand);

    expect(result).toEqual({
      status: 'ALREADY_PROCESSED',
      transactionId: 'concurrent-txn-id',
    });
  });
});
