import type { ClockPort } from '../ports/clock.js';

export interface Token {
  value: string;
  expiresAtMs: number;
}

const TTL_MS = 15 * 60 * 1000;

export class TokenService {
  constructor(private readonly clock: ClockPort) {}

  /** Absolute expiry, not a duration (D-01). */
  issue(value: string): Token {
    return { value, expiresAtMs: this.clock.nowMs() + TTL_MS };
  }

  isExpired(token: Token): boolean {
    return this.clock.nowMs() >= token.expiresAtMs;
  }
}
