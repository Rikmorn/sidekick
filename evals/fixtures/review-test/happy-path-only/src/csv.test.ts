import { describe, expect, it } from 'bun:test';
import { parseRow } from './csv.js';

describe('parseRow', () => {
  it('parses a well-formed line', () => {
    expect(parseRow('a-1,250')).toEqual({
      ok: true,
      row: { id: 'a-1', amount: 250 },
    });
  });

  it('parses a zero amount', () => {
    expect(parseRow('a-2,0')).toEqual({
      ok: true,
      row: { id: 'a-2', amount: 0 },
    });
  });

  it('parses a negative amount', () => {
    expect(parseRow('a-3,-40')).toEqual({
      ok: true,
      row: { id: 'a-3', amount: -40 },
    });
  });
});
