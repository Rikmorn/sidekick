import { describe, expect, it } from 'bun:test';
import { subtotalCents, type LineItem } from './pricing.js';

const item = (unitCents: number, qty: number): LineItem => ({
  sku: 'sku-1',
  unitCents,
  qty,
});

describe('subtotalCents', () => {
  it('sums unit price times quantity', () => {
    expect(subtotalCents([item(250, 2), item(100, 3)])).toBe(800);
  });

  it('is zero for an empty cart', () => {
    expect(subtotalCents([])).toBe(0);
  });
});
