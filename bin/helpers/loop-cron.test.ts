import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { parseCron, previousFire } from './loop-cron.js';

const cronOf = (expr: string) => {
  const parsed = parseCron(expr);
  if (!parsed.ok) throw new Error(`expected ${expr} to parse: ${parsed.issue}`);
  return parsed.cron;
};

describe('parseCron accepts', () => {
  test.each([
    '7 * * * *',
    '*/5 * * * *',
    '0 9 * * 1-5',
    '0,30 8-18/2 1 1,6 0',
    '0 0 * * 7',
    '0 0 29 2 1',
    '0 0 31 12 */7',
  ])('%s', (expr) => {
    expect(parseCron(expr).ok).toBe(true);
  });
});

describe('parseCron refuses', () => {
  const rows: [string, string][] = [
    ['* * * *', 'five fields'],
    ['* * * * * *', 'five fields'],
    ['60 * * * *', 'minute'],
    ['* 24 * * *', 'hour'],
    ['* * 0 * *', 'day of month'],
    ['* * * 13 *', 'month'],
    ['* * * * 8', 'day of week'],
    ['*/0 * * * *', 'minute'],
    ['5-1 * * * *', 'minute'],
    ['0 9 * * MON', 'day of week'],
    ['0 0 1 JAN *', 'month'],
    ['@hourly', 'five fields'],
    ['0 0 30 2 *', 'never fires'],
    ['0 0 29 2 *', 'never fires'],
  ];
  test.each(rows)('%s, naming %s', (expr, name) => {
    const parsed = parseCron(expr);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issue).toContain(name);
  });
});

describe('previousFire', () => {
  test('finds the latest matching minute at or before the instant', () => {
    const cron = cronOf('7 * * * *');
    expect(previousFire(cron, new Date(2026, 10, 14, 10, 6))).toEqual(
      new Date(2026, 10, 14, 9, 7),
    );
    expect(previousFire(cron, new Date(2026, 10, 14, 10, 7, 30))).toEqual(
      new Date(2026, 10, 14, 10, 7),
    );
  });

  test('matches either day field when both are restricted', () => {
    const cron = cronOf('0 0 1 * 1');
    // 2026-11-01 is a Sunday, 2026-11-09 a Monday.
    expect(previousFire(cron, new Date(2026, 10, 12, 12, 0))).toEqual(
      new Date(2026, 10, 9, 0, 0),
    );
    expect(previousFire(cron, new Date(2026, 10, 8, 12, 0))).toEqual(
      new Date(2026, 10, 2, 0, 0),
    );
    expect(previousFire(cron, new Date(2026, 10, 1, 12, 0))).toEqual(
      new Date(2026, 10, 1, 0, 0),
    );
  });

  test('requires both day fields when one starts with a star', () => {
    const cron = cronOf('0 0 */2 * 1');
    // Mondays on odd days of the month only.
    expect(previousFire(cron, new Date(2026, 10, 14, 12, 0))).toEqual(
      new Date(2026, 10, 9, 0, 0),
    );
  });

  test('a *-led day of week with a step still filters days, so a schedule can go years between fires', () => {
    // */7 matches Sunday alone; 2023-12-31 was the last Sunday 31 December before 2026-11-14.
    const cron = cronOf('0 0 31 12 */7');
    const at = new Date(2026, 10, 14);
    expect(previousFire(cron, at)).toBeUndefined();
    expect(previousFire(cron, at, 3 * 366)).toEqual(new Date(2023, 11, 31));
  });

  test('returns undefined when nothing fires inside the horizon', () => {
    expect(
      previousFire(cronOf('0 0 1 1 *'), new Date(2026, 10, 14), 30),
    ).toBeUndefined();
  });

  test('a yearly schedule is found within a second', () => {
    const start = performance.now();
    expect(
      previousFire(cronOf('0 0 1 1 *'), new Date(2026, 11, 31, 23, 59)),
    ).toEqual(new Date(2026, 0, 1, 0, 0));
    expect(performance.now() - start).toBeLessThan(1000);
  });

  test('skips a spring-forward gap in Europe/London', () => {
    // A child process, since Bun keeps the last TZ it saw and would leak it into other files.
    const modulePath = path.join(import.meta.dir, 'loop-cron.ts');
    const code = `
      import { parseCron, previousFire } from ${JSON.stringify(modulePath)};
      const p = parseCron('30 1 * * *');
      if (!p.ok) throw new Error(p.issue);
      const got = previousFire(p.cron, new Date(2027, 2, 28, 3, 0));
      console.log(JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, at: got && [got.getFullYear(), got.getMonth(), got.getDate(), got.getHours(), got.getMinutes()] }));
    `;
    const run = Bun.spawnSync([process.execPath, '-e', code], {
      env: { ...process.env, TZ: 'Europe/London' },
    });
    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout.toString())).toEqual({
      tz: 'Europe/London',
      at: [2027, 2, 27, 1, 30],
    });
  });
});
