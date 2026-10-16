import { expect, test } from 'claude-code/testing';
import { BRIEF_HEADER } from './contract';
import type { BoardView } from './logic';
import {
  afterRun,
  bandLines,
  briefFrom,
  clockText,
  fromBrief,
  isBoardWrite,
} from './logic';

const entry = `${BRIEF_HEADER}\n\nPickup: milestone 9\nIn progress: #211`;
const lines = ['Pickup: milestone 9', 'In progress: #211'];

test('briefFrom picks sidekick entry from among others in any order', () => {
  const other = 'Another plugin says hello';
  expect(briefFrom([other, entry])).toEqual(lines);
  expect(briefFrom([entry, other])).toEqual(lines);
  expect(briefFrom(['x', entry, 'y'])).toEqual(lines);
});

test('briefFrom gives undefined when no entry is sidekick, or for undefined', () => {
  expect(briefFrom(['one', 'two'])).toBeUndefined();
  expect(briefFrom([])).toBeUndefined();
  expect(briefFrom(undefined)).toBeUndefined();
});

test('briefFrom parses a CRLF entry the same', () => {
  expect(briefFrom([entry.replace(/\n/g, '\r\n')])).toEqual(lines);
});

test('briefFrom drops trailing empty lines', () => {
  expect(briefFrom([`${entry}\n`])).toEqual(lines);
  expect(briefFrom([`${entry}\r\n\r\n`])).toEqual(lines);
});

test('briefFrom gives an empty list for a header with no brief', () => {
  expect(briefFrom([BRIEF_HEADER])).toEqual([]);
  expect(briefFrom([`${BRIEF_HEADER}\n\n`])).toEqual([]);
});

test('isBoardWrite is true for the writes pickup reads', () => {
  const writes = [
    'gh project item-edit 2 --owner @me --url u --field Status --value Done',
    'gh project item-add 2 --owner @me --url u',
    'gh issue close 228 -R o/r --reason completed',
    'gh issue reopen 1',
    'gh issue create --title t --body-file f',
    'gh issue edit 211 --add-label x',
    'gh api -X PATCH repos/o/r/milestones/9 --input f',
    'gh api --method PATCH repos/o/r/milestones/9 -f description=x',
    'cd /x && gh issue close 3',
    'git fetch; gh issue close 3 | cat',
    'true || gh issue reopen 4',
  ];
  for (const command of writes) {
    expect(isBoardWrite(command)).toBe(true);
  }
});

test('isBoardWrite is false for reads and look-alikes', () => {
  const reads = [
    'gh issue list',
    'gh issue view 211',
    'gh project item-list 2',
    'gh api repos/o/r/milestones/9',
    'gh api graphql -f query=mutation{createProjectV2StatusUpdate(input:{})}',
    'sidekick pm pickup --brief',
    'git commit -m "gh issue close"',
    '',
  ];
  for (const command of reads) {
    expect(isBoardWrite(command)).toBe(false);
  }
});

test('isBoardWrite accepts a quoted match, which costs one refresh', () => {
  expect(isBoardWrite('echo "done; gh issue close 3"')).toBe(true);
});

test('afterRun gives ok with the lines and the time of a good run', () => {
  expect(
    afterRun({ state: 'empty' }, { ok: true, stdout: 'a\nb\n' }, '09:05'),
  ).toEqual({ state: 'ok', lines: ['a', 'b'], takenAt: '09:05' });
});

test('afterRun gives empty for a run with no output', () => {
  const ok: BoardView = { state: 'ok', lines: ['a'], takenAt: '09:00' };
  expect(afterRun(ok, { ok: true, stdout: '\n' }, '09:05')).toEqual({
    state: 'empty',
  });
});

test('afterRun keeps the last good lines when a run fails after ok or stale', () => {
  const ok: BoardView = { state: 'ok', lines: ['a'], takenAt: '09:00' };
  const stale = afterRun(ok, { ok: false, reason: 'timed out' }, '09:05');
  expect(stale).toEqual({
    state: 'stale',
    lines: ['a'],
    takenAt: '09:00',
    failedAt: '09:05',
  });
  expect(afterRun(stale, { ok: false, reason: 'x' }, '09:10')).toEqual({
    state: 'stale',
    lines: ['a'],
    takenAt: '09:00',
    failedAt: '09:10',
  });
});

test('afterRun gives failed when a run fails after empty or failed', () => {
  const run = { ok: false, reason: 'gh missing' } as const;
  expect(afterRun({ state: 'empty' }, run, '09:05')).toEqual({
    state: 'failed',
    reason: 'gh missing',
  });
  expect(afterRun({ state: 'failed', reason: 'old' }, run, '09:05')).toEqual({
    state: 'failed',
    reason: 'gh missing',
  });
});

test('afterRun recovers to ok from stale', () => {
  const stale: BoardView = {
    state: 'stale',
    lines: ['a'],
    takenAt: '09:00',
    failedAt: '09:05',
  };
  expect(afterRun(stale, { ok: true, stdout: 'b' }, '09:10')).toEqual({
    state: 'ok',
    lines: ['b'],
    takenAt: '09:10',
  });
});

test('fromBrief gives ok, or empty for a header with no brief', () => {
  expect(fromBrief(lines, '09:05')).toEqual({
    state: 'ok',
    lines,
    takenAt: '09:05',
  });
  expect(fromBrief([], '09:05')).toEqual({ state: 'empty' });
});

test('bandLines draws nothing for empty', () => {
  expect(bandLines({ state: 'empty' }, 80)).toEqual([]);
});

test('bandLines stamps the first line of ok as a heading', () => {
  expect(bandLines(fromBrief(lines, '09:05'), 80)).toEqual([
    { tone: 'heading', text: 'Pickup: milestone 9 · as of 09:05' },
    { tone: 'plain', text: 'In progress: #211' },
  ]);
});

test('bandLines stamps the first line of stale with the failure time', () => {
  const view: BoardView = {
    state: 'stale',
    lines,
    takenAt: '09:00',
    failedAt: '09:05',
  };
  expect(bandLines(view, 80)).toEqual([
    { tone: 'heading', text: 'Pickup: milestone 9 · refresh failed 09:05' },
    { tone: 'plain', text: 'In progress: #211' },
  ]);
});

test('bandLines gives one failure line for failed', () => {
  expect(bandLines({ state: 'failed', reason: 'timed out' }, 80)).toEqual([
    { tone: 'failure', text: '⚠ board: timed out' },
  ]);
});

test('bandLines cuts every line to the columns, wide characters included', () => {
  const view = fromBrief(
    ['Pickup — milestone … nine', 'In progress — #211 …'],
    '09:05',
  );
  for (const columns of [10, 0]) {
    for (const line of bandLines(view, columns)) {
      expect([...line.text].length).toBeLessThanOrEqual(columns);
    }
  }
  expect(bandLines(view, 10)[0]?.text).toBe('Pickup — m');
  expect(
    bandLines({ state: 'failed', reason: 'long reason here' }, 10)[0]?.text,
  ).toBe('⚠ board: l');
});

test('clockText gives local HH:MM', () => {
  expect(clockText(new Date(2026, 9, 16, 9, 5).getTime())).toBe('09:05');
  expect(clockText(new Date(2026, 9, 16, 23, 59).getTime())).toBe('23:59');
});
