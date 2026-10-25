import type { AgentInfo, AgentStatus } from 'claude-code';
import { expect, test } from 'claude-code/testing';
import { width } from '../lines';
import {
  isLive,
  keyOf,
  type PublishedSession,
  parsePublished,
  STALE_MS,
} from './contract';
import {
  ACTIVITY_COLUMNS,
  activityOf,
  buildKey,
  idleText,
  MAX_SUBAGENTS,
  type SessionFacts,
  sameKey,
  selfFactsOf,
} from './logic';

const SESSION = '4c5c78de-c5a3-4bde-a594-51c8a9d2db1e';
const MAIN = 'Single word reply';
const PUBLISHED_AT = 1_792_966_244_079;

const KEY: PublishedSession = {
  version: 1,
  sessionId: SESSION,
  name: 'p13 desk pane',
  role: 'worker',
  main: MAIN,
  profile: 'worker',
  activity: 'Bash: bun run test',
  subagents: [
    { type: 'general-purpose', description: 'probe alpha', status: 'running' },
  ],
  context: { used: 64_347, limit: 967_000 },
  publishedAt: PUBLISHED_AT,
};

const FACTS: SessionFacts = {
  sessionId: SESSION,
  self: { role: 'main', profile: 'main' },
};

function agent(id: string, status: AgentStatus): AgentInfo {
  return { id, type: 'general-purpose', description: `task ${id}`, status };
}

test('keyOf names the session under session:', () => {
  expect(keyOf(SESSION)).toBe(`session:${SESSION}`);
});

test('parsePublished reads a whole key back as it was', () => {
  expect(parsePublished(JSON.parse(JSON.stringify(KEY)))).toEqual(KEY);
});

test('parsePublished reads the key buildKey makes', () => {
  const key = buildKey(FACTS, [agent('a1', 'running')], PUBLISHED_AT);
  expect(parsePublished(key)).toEqual(key);
});

test('parsePublished rejects another version', () => {
  expect(parsePublished({ ...KEY, version: 2 })).toBeUndefined();
});

test('parsePublished rejects a key with no role', () => {
  const { role: _role, ...noRole } = KEY;
  expect(parsePublished(noRole)).toBeUndefined();
});

test('parsePublished rejects subagents that are not an array', () => {
  expect(parsePublished({ ...KEY, subagents: {} })).toBeUndefined();
  expect(parsePublished({ ...KEY, subagents: 'none' })).toBeUndefined();
});

test('parsePublished rejects a subagent of the wrong shape', () => {
  const subagents = [{ type: 'Explore', description: 1, status: 'running' }];
  expect(parsePublished({ ...KEY, subagents })).toBeUndefined();
});

test('parsePublished rejects what is not a key', () => {
  const values: unknown[] = [
    undefined,
    null,
    'session',
    [],
    { ...KEY, sessionId: '' },
    { ...KEY, role: 'boss' },
    { ...KEY, publishedAt: '1792966244079' },
  ];
  for (const value of values) expect(parsePublished(value)).toBeUndefined();
});

test('parsePublished reads a mistyped optional field as absent', () => {
  const parsed = parsePublished({
    ...KEY,
    name: 7,
    activity: null,
    context: { used: '1', limit: 2 },
  });
  expect(parsed?.name).toBeUndefined();
  expect(parsed?.activity).toBeUndefined();
  expect(parsed?.context).toBeUndefined();
  expect(parsed?.role).toBe('worker');
});

test('isLive is false with no row in the listing', () => {
  expect(isLive(KEY, undefined, PUBLISHED_AT)).toBe(false);
});

test('isLive is false for a row with no pid', () => {
  expect(isLive(KEY, { hasPid: false }, PUBLISHED_AT)).toBe(false);
});

test('isLive is false once the key is older than STALE_MS', () => {
  const now = PUBLISHED_AT + STALE_MS + 1;
  expect(isLive(KEY, { hasPid: true }, now)).toBe(false);
});

test('isLive is true for a row with a pid and a key STALE_MS old or newer', () => {
  expect(isLive(KEY, { hasPid: true }, PUBLISHED_AT)).toBe(true);
  expect(isLive(KEY, { hasPid: true }, PUBLISHED_AT + STALE_MS)).toBe(true);
});

test('buildKey keeps only running, pending, and waiting subagents', () => {
  const agents = [
    agent('a1', 'running'),
    agent('a2', 'completed'),
    agent('a3', 'pending'),
    agent('a4', 'failed'),
    agent('a5', 'waiting'),
    agent('a6', 'idle'),
    agent('a7', 'killed'),
  ];
  const key = buildKey(FACTS, agents, PUBLISHED_AT);
  expect(key.subagents).toEqual([
    { type: 'general-purpose', description: 'task a1', status: 'running' },
    { type: 'general-purpose', description: 'task a3', status: 'pending' },
    { type: 'general-purpose', description: 'task a5', status: 'waiting' },
  ]);
});

test('buildKey keeps at most MAX_SUBAGENTS subagents, the first listed', () => {
  const agents = Array.from({ length: MAX_SUBAGENTS + 2 }, (_, index) =>
    agent(`a${index}`, 'running'),
  );
  const key = buildKey(FACTS, agents, PUBLISHED_AT);
  expect(key.subagents).toHaveLength(MAX_SUBAGENTS);
  expect(key.subagents[0]?.description).toBe('task a0');
});

test('buildKey carries context only when both the tokens and the limit are known', () => {
  const both = buildKey({ ...FACTS, tokens: 10, limit: 100 }, [], PUBLISHED_AT);
  expect(both.context).toEqual({ used: 10, limit: 100 });
  expect(
    buildKey({ ...FACTS, tokens: 10 }, [], PUBLISHED_AT).context,
  ).toBeUndefined();
  expect(
    buildKey({ ...FACTS, limit: 100 }, [], PUBLISHED_AT).context,
  ).toBeUndefined();
});

test('buildKey leaves out what is unknown', () => {
  expect(buildKey(FACTS, [], PUBLISHED_AT)).toEqual({
    version: 1,
    sessionId: SESSION,
    role: 'main',
    profile: 'main',
    subagents: [],
    publishedAt: PUBLISHED_AT,
  });
});

test('sameKey ignores publishedAt and nothing else', () => {
  const first = buildKey(FACTS, [], PUBLISHED_AT);
  const later = buildKey(FACTS, [], PUBLISHED_AT + 60_000);
  const busier = buildKey({ ...FACTS, activity: 'Read: a.ts' }, [], 0);
  const cleared = buildKey({ ...FACTS, sessionId: 'other' }, [], 0);
  expect(sameKey(first, later)).toBe(true);
  expect(sameKey(first, busier)).toBe(false);
  expect(sameKey(first, cleared)).toBe(false);
});

test('selfFactsOf names a worker main and leaves out what is unknown', () => {
  expect(
    selfFactsOf({
      role: { kind: 'worker', main: MAIN },
      profile: 'worker',
      name: 'p13',
    }),
  ).toEqual({ name: 'p13', role: 'worker', main: MAIN, profile: 'worker' });
  expect(
    selfFactsOf({
      role: { kind: 'worker', main: undefined },
      profile: undefined,
      name: undefined,
    }),
  ).toStrictEqual({ role: 'worker' });
  expect(
    selfFactsOf({ role: { kind: 'other' }, profile: 'qa', name: undefined }),
  ).toStrictEqual({ role: 'other', profile: 'qa' });
});

test('activityOf takes the file path first', () => {
  expect(
    activityOf('Read', { file_path: 'plugin/hooks/lines.ts', command: 'x' }),
  ).toBe('Read: plugin/hooks/lines.ts');
});

test("activityOf takes a command's first line", () => {
  expect(
    activityOf('Bash', { command: '\n  bun run test\nbun run check' }),
  ).toBe('Bash: bun run test');
});

test('activityOf takes a description, then a pattern', () => {
  expect(
    activityOf('Agent', { description: 'probe alpha', prompt: 'Run …' }),
  ).toBe('Agent: probe alpha');
  expect(activityOf('Grep', { pattern: 'sessionId' })).toBe('Grep: sessionId');
});

test("activityOf gives the tool's name alone without a target", () => {
  expect(activityOf('TodoWrite', { todos: [] })).toBe('TodoWrite');
  expect(activityOf('Bash', { command: '  \n ' })).toBe('Bash');
  expect(activityOf('Bash', null)).toBe('Bash');
});

test("activityOf keeps a long path's end and a long command's start", () => {
  const folder = 'a/'.repeat(ACTIVITY_COLUMNS);
  const path = activityOf('Edit', { file_path: `/${folder}logic.ts` });
  expect(width(path)).toBe(ACTIVITY_COLUMNS);
  expect(path).toStartWith('Edit: …');
  expect(path).toEndWith('/logic.ts');
  const command = activityOf('Bash', { command: `echo ${'x'.repeat(99)}` });
  expect(width(command)).toBe(ACTIVITY_COLUMNS);
  expect(command).toStartWith('Bash: echo x');
});

test('idleText gives the local time the turn ended', () => {
  const at = new Date(2026, 9, 25, 9, 5).getTime();
  expect(idleText(at)).toBe('idle since 09:05');
});
