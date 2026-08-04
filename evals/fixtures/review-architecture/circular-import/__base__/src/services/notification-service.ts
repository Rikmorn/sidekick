import { subscribe, type Event } from '../events/bus.js';

export interface Notification {
  to: string;
  subject: string;
  body: string;
}

const outbox: Notification[] = [];

export function renderDelay(event: Event): Notification {
  return {
    to: event.customerEmail,
    subject: 'Your delivery estimate has changed',
    body: `Order ${event.orderId} is now expected on ${event.newEstimate}.`,
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
