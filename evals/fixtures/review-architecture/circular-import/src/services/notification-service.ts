import { subscribe, type Event } from '../events/bus.js';
import { findOrder } from './order-service.js';

export interface Notification {
  to: string;
  subject: string;
  body: string;
}

const outbox: Notification[] = [];

export function renderDelay(event: Event): Notification {
  const order = findOrder(event.orderId);
  const previously =
    order === undefined ? 'an earlier date' : order.estimatedDelivery;
  return {
    to: event.customerEmail,
    subject: 'Your delivery estimate has changed',
    body: `Order ${event.orderId} moved from ${previously} to ${event.newEstimate}.`,
  };
}

export function start(): void {
  subscribe((event) => {
    outbox.push(renderDelay(event));
  });
}

export function drainOutbox(): Notification[] {
  return outbox.splice(0, outbox.length);
}
