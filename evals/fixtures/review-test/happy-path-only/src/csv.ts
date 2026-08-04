export interface Row {
  id: string;
  amount: number;
}

export type ParseResult =
  | { ok: true; row: Row }
  | { ok: false; reason: 'wrong_arity' | 'blank_id' | 'bad_amount' };

/**
 * Parse one `<id>,<amount>` line from the settlement export. Malformed lines
 * are reported rather than silently coerced, so the importer can skip them.
 */
export function parseRow(line: string): ParseResult {
  const fields = line.split(',');
  if (fields.length !== 2) {
    return { ok: false, reason: 'wrong_arity' };
  }
  const [id, rawAmount] = fields;
  if (id.trim() === '') {
    return { ok: false, reason: 'blank_id' };
  }
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) {
    return { ok: false, reason: 'bad_amount' };
  }
  return { ok: true, row: { id, amount } };
}
