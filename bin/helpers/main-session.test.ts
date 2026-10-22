import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { removeTemps, tmp } from './fixtures/worker/repo.js';
import {
  configDirOf,
  MAIN_MARKERS,
  mainLine,
  mainReport,
  nameHeld,
  resolveMain,
  withoutMarkers,
} from './main-session.js';
import type { Job } from './worker-jobs.js';

afterEach(removeTemps);

const SID = '12ab8963-1111-2222-3333-444444444444';
const job = (over: Partial<Job> = {}): Job => ({
  id: undefined,
  kind: undefined,
  name: undefined,
  sessionId: undefined,
  state: undefined,
  ...over,
});
const jobs = [
  job({ sessionId: 'other-id', name: 'someone-else' }),
  job({ sessionId: SID, name: 'p11-main-views' }),
];

describe('resolveMain', () => {
  test('an inherited SIDEKICK_MAIN passes through, whatever the listing says', () => {
    expect(
      resolveMain(
        { SIDEKICK_MAIN: 'sidekick-c8', CLAUDE_CODE_SESSION_ID: SID },
        jobs,
      ),
    ).toEqual({ value: 'sidekick-c8', from: 'inherited' });
  });
  test('inside a session, the row with that sessionId gives its name', () => {
    expect(resolveMain({ CLAUDE_CODE_SESSION_ID: SID }, jobs)).toEqual({
      value: 'p11-main-views',
      from: 'listing',
      sessionId: SID,
    });
  });
  test('a row without a name gives the first 8 characters of the id', () => {
    const unnamed = [job({ sessionId: SID })];
    expect(resolveMain({ CLAUDE_CODE_SESSION_ID: SID }, unnamed)).toEqual({
      value: '12ab8963',
      from: 'id',
      sessionId: SID,
    });
  });
  test('no row gives the id', () => {
    expect(resolveMain({ CLAUDE_CODE_SESSION_ID: SID }, [])?.from).toBe('id');
  });
  test('a failed listing inside a session gives the id', () => {
    expect(resolveMain({ CLAUDE_CODE_SESSION_ID: SID }, undefined)).toEqual({
      value: '12ab8963',
      from: 'id',
      sessionId: SID,
    });
  });
  test('outside any session, nothing', () => {
    expect(resolveMain({}, jobs)).toBeUndefined();
    expect(resolveMain({ CLAUDE_CODE_SESSION_ID: '' }, jobs)).toBeUndefined();
  });
  test('an empty SIDEKICK_MAIN is no marker', () => {
    expect(
      resolveMain({ SIDEKICK_MAIN: '', CLAUDE_CODE_SESSION_ID: SID }, jobs)
        ?.from,
    ).toBe('listing');
  });
  test('a name with spaces is kept whole', () => {
    const spaced = [job({ sessionId: SID, name: 'Single word reply' })];
    expect(resolveMain({ CLAUDE_CODE_SESSION_ID: SID }, spaced)?.value).toBe(
      'Single word reply',
    );
    expect(
      resolveMain({ SIDEKICK_MAIN: 'Single word reply' }, undefined)?.value,
    ).toBe('Single word reply');
  });
});

describe('nameHeld', () => {
  const sessionsDir = (): {
    configDir: string;
    put: (f: string, c: string) => void;
  } => {
    const configDir = tmp();
    const dir = path.join(configDir, 'sessions');
    fs.mkdirSync(dir);
    return { configDir, put: (f, c) => fs.writeFileSync(path.join(dir, f), c) };
  };
  const file = (sessionId: string, nameSource?: string): string =>
    JSON.stringify({ pid: 1, sessionId, kind: 'bg', nameSource });

  test.each([
    ['derived', false],
    ['auto', false],
    ['user', true],
    ['peer', true],
  ])('nameSource %s gives %p', (source, expected) => {
    const { configDir, put } = sessionsDir();
    put('1.json', file(SID, source));
    expect(nameHeld(configDir, SID)).toBe(expected);
  });
  test('no nameSource holds', () => {
    const { configDir, put } = sessionsDir();
    put('1.json', file(SID));
    expect(nameHeld(configDir, SID)).toBe(true);
  });
  test('no file with that sessionId gives null', () => {
    const { configDir, put } = sessionsDir();
    put('1.json', file('other', 'user'));
    expect(nameHeld(configDir, SID)).toBeNull();
  });
  test('an unreadable folder gives null', () => {
    expect(nameHeld(path.join(tmp(), 'missing'), SID)).toBeNull();
  });
  test('files match on sessionId, not on their names', () => {
    const { configDir, put } = sessionsDir();
    put('1.json', file('old-interactive-id', 'user'));
    put('2.json', file(SID, 'derived'));
    expect(nameHeld(configDir, SID)).toBe(false);
  });
  test('a malformed file does not hide a good match', () => {
    const { configDir, put } = sessionsDir();
    put('0.json', '{not json');
    put('1.json', JSON.stringify({ sessionId: 7 }));
    put('2.json', file(SID, 'user'));
    expect(nameHeld(configDir, SID)).toBe(true);
  });
});

describe('withoutMarkers', () => {
  test('drops both markers, keeps the rest, and leaves its argument alone', () => {
    const env = { SIDEKICK_MAIN: 'a', SIDEKICK_WORKER: '/b', PATH: '/bin' };
    expect(withoutMarkers(env)).toEqual({ PATH: '/bin' });
    expect(env.SIDEKICK_MAIN).toBe('a');
    expect(MAIN_MARKERS).toEqual(['SIDEKICK_MAIN', 'SIDEKICK_WORKER']);
  });
});

describe('mainLine', () => {
  const suffix =
    ' · sidekick holds this name when this turn ends; ← before then loses it';
  test('the suffix only for a listed main whose name is not held', () => {
    const listing = { value: 'x', from: 'listing', sessionId: SID } as const;
    expect(mainLine(listing, false)).toBe(`main: x${suffix}`);
    expect(mainLine(listing, true)).toBe('main: x');
    expect(mainLine(listing, null)).toBe('main: x');
    expect(mainLine({ value: 'x', from: 'id', sessionId: SID }, false)).toBe(
      'main: x',
    );
    expect(mainLine({ value: 'x', from: 'inherited' }, false)).toBe('main: x');
  });
});

describe('configDirOf', () => {
  test('an empty CLAUDE_CONFIG_DIR means unset', () => {
    expect(configDirOf({ CLAUDE_CONFIG_DIR: '' }, '/h')).toBe('/h/.claude');
    expect(configDirOf({ CLAUDE_CONFIG_DIR: '/c' }, '/h')).toBe('/c');
  });
});

describe('mainReport', () => {
  const configWith = (nameSource: string): string => {
    const configDir = tmp();
    fs.mkdirSync(path.join(configDir, 'sessions'));
    fs.writeFileSync(
      path.join(configDir, 'sessions', '1.json'),
      JSON.stringify({ sessionId: SID, nameSource }),
    );
    return configDir;
  };
  const suffix =
    ' · sidekick holds this name when this turn ends; ← before then loses it';
  const listing = { value: 'x', from: 'listing', sessionId: SID } as const;

  test('adds the suffix for an automatic name, read from CLAUDE_CONFIG_DIR', () => {
    const env = { CLAUDE_CONFIG_DIR: configWith('derived') };
    expect(mainReport(listing, env, '/nowhere')).toBe(`main: x${suffix}`);
  });
  test('leaves the suffix off for a name the operator chose', () => {
    const env = { CLAUDE_CONFIG_DIR: configWith('user') };
    expect(mainReport(listing, env, '/nowhere')).toBe('main: x');
  });
  test('reads the default folder under home when CLAUDE_CONFIG_DIR is unset', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.claude', 'sessions'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.claude', 'sessions', '1.json'),
      JSON.stringify({ sessionId: SID, nameSource: 'derived' }),
    );
    expect(mainReport(listing, {}, home)).toBe(`main: x${suffix}`);
  });
  test('an inherited main never reads the sessions file', () => {
    const env = { CLAUDE_CONFIG_DIR: '/does/not/exist' };
    expect(mainReport({ value: 'root', from: 'inherited' }, env, '/h')).toBe(
      'main: root',
    );
  });
  test('an unreadable sessions folder gives no suffix', () => {
    expect(mainReport(listing, { CLAUDE_CONFIG_DIR: tmp() }, '/h')).toBe(
      'main: x',
    );
  });
});
