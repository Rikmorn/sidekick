import { describe, expect, it } from 'bun:test';
import { parseRow } from './csv.js';

describe('parseRow', () => {
  it('splits id and amount', () => {
    expect(parseRow('a-1,250')).toEqual({ id: 'a-1', amount: 250 });
  });
});
