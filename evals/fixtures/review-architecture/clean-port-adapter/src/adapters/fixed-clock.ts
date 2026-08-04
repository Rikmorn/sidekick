import type { ClockPort } from '../ports/clock.js';

/**
 * A clock the caller advances by hand. Lets token expiry be exercised without
 * sleeping (g1) while production keeps the system clock (g2).
 */
export class FixedClock implements ClockPort {
  private currentMs: number;

  constructor(startMs: number) {
    this.currentMs = startMs;
  }

  nowMs(): number {
    return this.currentMs;
  }

  advance(deltaMs: number): void {
    this.currentMs += deltaMs;
  }

  set(atMs: number): void {
    this.currentMs = atMs;
  }
}
