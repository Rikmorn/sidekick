import { publish } from '../events/bus.js';
import { start as startNotifications } from './notification-service.js';

export interface Order {
  id: string;
  customerEmail: string;
  estimatedDelivery: string;
}

const orders = new Map<string, Order>();

export function findOrder(id: string): Order | undefined {
  return orders.get(id);
}

export function seed(order: Order): void {
  orders.set(order.id, order);
}

export async function delayOrder(id: string, newEstimate: string): Promise<void> {
  const order = orders.get(id);
  if (order === undefined) return;
  order.estimatedDelivery = newEstimate;
  await publish({
    type: 'order.delayed',
    orderId: order.id,
    customerEmail: order.customerEmail,
    newEstimate,
  });
}

export function boot(): void {
  startNotifications();
}
