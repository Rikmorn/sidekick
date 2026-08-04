import type { ClockPort } from '../ports/clock.js';

export class SystemClock implements ClockPort {
  nowMs(): number {
    return Date.now();
  }
}
