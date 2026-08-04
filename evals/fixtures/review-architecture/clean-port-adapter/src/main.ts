import { FixedClock } from './adapters/fixed-clock.js';
import { SystemClock } from './adapters/system-clock.js';
import type { ClockPort } from './ports/clock.js';
import { TokenService } from './services/token-service.js';

export function buildTokenService(clock: ClockPort = new SystemClock()): TokenService {
  return new TokenService(clock);
}

/** Test wiring: the same service over a clock the caller drives. */
export function buildTokenServiceWithFixedClock(
  startMs: number,
): { service: TokenService; clock: FixedClock } {
  const clock = new FixedClock(startMs);
  return { service: buildTokenService(clock), clock };
}
