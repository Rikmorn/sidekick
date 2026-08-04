export interface OrderDelayed {
  type: 'order.delayed';
  orderId: string;
  customerEmail: string;
  newEstimate: string;
}

export type Event = OrderDelayed;

type Handler = (event: Event) => void | Promise<void>;

const handlers: Handler[] = [];

export function subscribe(handler: Handler): void {
  handlers.push(handler);
}

export async function publish(event: Event): Promise<void> {
  for (const handler of handlers) {
    await handler(event);
  }
}
