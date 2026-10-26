import { expect, test } from 'claude-code/testing';
import { GLANCE_VERSION, parseGlance, parsePane } from './contract';

const full = {
  version: 1,
  board: {
    owner: 'Rikmorn',
    repo: 'sidekick',
    number: 3,
    url: 'https://github.com/users/Rikmorn/projects/3',
  },
  milestone: 'R9 control centre',
  state: { level: 'warning', word: 'at risk', detail: '#233 waits on you' },
  brief: 'Pickup: milestone 9\nIn progress: #233',
};

const notParsed = { ok: false, reason: "the pickup's output did not parse" };

test('parseGlance keeps every field of a version-1 glance', () => {
  expect(parseGlance(JSON.stringify(full))).toEqual({
    ok: true,
    glance: { ...full, version: GLANCE_VERSION },
  });
});

test('parseGlance ignores an unknown field, keeping the known ones', () => {
  const text = JSON.stringify({ ...full, added: 'later' });
  expect(parseGlance(text)).toEqual({
    ok: true,
    glance: { ...full, version: GLANCE_VERSION },
  });
});

test('parseGlance accepts a null milestone and a null detail', () => {
  const parsed = parseGlance(
    JSON.stringify({
      ...full,
      milestone: null,
      state: { level: 'unknown', word: 'unknown', detail: null },
    }),
  );
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.glance.milestone).toBeNull();
    expect(parsed.glance.state.detail).toBeNull();
  }
});

test('parseGlance reads text that is not JSON as not parsed', () => {
  expect(parseGlance('Pickup: milestone 9')).toEqual(notParsed);
  expect(parseGlance('')).toEqual(notParsed);
});

test('parseGlance reads a truncated object as not parsed', () => {
  const text = JSON.stringify(full);
  expect(parseGlance(text.slice(0, text.length - 10))).toEqual(notParsed);
});

test('parseGlance reads another version as not parsed', () => {
  expect(parseGlance(JSON.stringify({ ...full, version: 2 }))).toEqual(
    notParsed,
  );
});

test('parseGlance reads a level outside the four as not parsed', () => {
  const state = { ...full.state, level: 'great' };
  expect(parseGlance(JSON.stringify({ ...full, state }))).toEqual(notParsed);
});

test('parseGlance reads a string board number as not parsed', () => {
  const board = { ...full.board, number: '3' };
  expect(parseGlance(JSON.stringify({ ...full, board }))).toEqual(notParsed);
});

test('parseGlance reads a missing brief as not parsed', () => {
  const { brief: _brief, ...without } = full;
  expect(parseGlance(JSON.stringify(without))).toEqual(notParsed);
});

const node = (children: unknown[] = []) => ({
  mark: 'running',
  ref: '#240',
  text: 'The usage guide',
  right: '3 d',
  weight: 'strong',
  children,
});

const pane = {
  rows: [
    { kind: 'prose', mark: 'next', text: 'continue #240' },
    { kind: 'prose', mark: 'drift', text: '3 unpushed' },
    { kind: 'prose', mark: 'outcome', text: 'Outcome: it ships.' },
    {
      kind: 'cells',
      plans: ['done', 'running', 'next', 'later'],
      label: '1/4 plans',
    },
    { kind: 'tree', nodes: [node([{ ...node(), ref: null, right: null }])] },
  ],
};

const chain = (levels: number): unknown =>
  levels === 1 ? node() : node([chain(levels - 1)]);

test('parsePane keeps every field of a full pane', () => {
  expect(parsePane(pane)).toEqual(pane);
});

test('parsePane accepts a null ref and a null right', () => {
  const row = { kind: 'tree', nodes: [{ ...node(), ref: null, right: null }] };
  expect(parsePane({ rows: [row] })).toEqual({ rows: [row] });
});

test('parsePane rejects an unknown row kind', () => {
  expect(parsePane({ rows: [{ kind: 'table', nodes: [] }] })).toBeUndefined();
});

test('parsePane rejects an unknown mark on prose or on a node', () => {
  const prose = { kind: 'prose', mark: 'warning', text: 'x' };
  expect(parsePane({ rows: [prose] })).toBeUndefined();
  const bad = { kind: 'tree', nodes: [{ ...node(), mark: 'open' }] };
  expect(parsePane({ rows: [bad] })).toBeUndefined();
});

test('parsePane rejects an unknown weight', () => {
  const bad = { kind: 'tree', nodes: [{ ...node(), weight: 'bold' }] };
  expect(parsePane({ rows: [bad] })).toBeUndefined();
});

test('parsePane rejects a text that is not a string', () => {
  const bad = { kind: 'tree', nodes: [{ ...node(), text: 4 }] };
  expect(parsePane({ rows: [bad] })).toBeUndefined();
  expect(
    parsePane({ rows: [{ kind: 'prose', mark: 'next', text: null }] }),
  ).toBeUndefined();
});

test('parsePane rejects a node with no children', () => {
  const { children: _children, ...without } = node();
  expect(
    parsePane({ rows: [{ kind: 'tree', nodes: [without] }] }),
  ).toBeUndefined();
});

test('parsePane rejects a cell state outside the four', () => {
  const bad = { kind: 'cells', plans: ['done', 'group'], label: '1/2 plans' };
  expect(parsePane({ rows: [bad] })).toBeUndefined();
});

test('parsePane accepts a tree four levels deep and rejects five', () => {
  const four = { rows: [{ kind: 'tree', nodes: [chain(4)] }] };
  expect(parsePane(four)).toEqual(four);
  expect(
    parsePane({ rows: [{ kind: 'tree', nodes: [chain(5)] }] }),
  ).toBeUndefined();
});

test('parsePane rejects values that are not a pane', () => {
  expect(parsePane(undefined)).toBeUndefined();
  expect(parsePane({ rows: 'none' })).toBeUndefined();
  expect(parsePane([])).toBeUndefined();
});
