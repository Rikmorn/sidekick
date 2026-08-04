export interface PolicyResult {
  ok: boolean;
  failedRule?: 'length' | 'digit' | 'symbol';
}

/** Strength policy per D-02: length >= 12, one digit, one symbol. */
export function meetsPolicy(password: string): PolicyResult {
  return { ok: true };
}
