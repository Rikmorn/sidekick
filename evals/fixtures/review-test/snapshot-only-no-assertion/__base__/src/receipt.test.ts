import { describe, expect, it } from 'bun:test';
import { subtotal, type Order } from './receipt.js';

const order: Order = {
  items: [
    { name: 'mug', cents: 1250 },
    { name: 'beans', cents: 899 },
  ],
  taxRate: 0.2,
};

describe('subtotal', () => {
  it('adds the line items', () => {
    expect(subtotal(order)).toBe(2149);
  });

  it('is zero for an empty order', () => {
    expect(subtotal({ items: [], taxRate: 0 })).toBe(0);
  });
});
