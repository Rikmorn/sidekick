import type { Order } from './types.js';

const TTL_MS = 24 * 60 * 60 * 1000;

interface Entry {
  order: Order;
  recordedAt: number;
}

export class IdempotencyStore {
  private readonly entries = new Map<string, Entry>();

  lookup(key: string, now: Date): Order | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (now.getTime() - entry.recordedAt >= TTL_MS) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.order;
  }

  remember(key: string, order: Order, now: Date): void {
    this.entries.set(key, { order, recordedAt: now.getTime() });
  }
}
