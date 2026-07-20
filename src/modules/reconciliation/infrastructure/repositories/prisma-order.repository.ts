import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { type IOrderRepository } from '../../application/ports/db/order-repository.port';
import { OrderEntity } from '../../domain/entities/order.entity';

@Injectable()
export class PrismaOrderRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCodes(codes: string[]): Promise<OrderEntity[]> {
    const orders = await this.prisma.order.findMany({
      where: { code: { in: codes } },
    });

    return orders.map(
      (o) =>
        new OrderEntity(
          o.id,
          o.code,
          Number(o.amount),
          o.currency,
          o.status,
          o.createdAt,
        ),
    );
  }
}
