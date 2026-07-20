import { OrderEntity } from '../../../domain/entities/order.entity';

export const ORDER_REPOSITORY = Symbol('IOrderRepository');

export interface IOrderRepository {
  findByCodes(codes: string[]): Promise<OrderEntity[]>;
}
