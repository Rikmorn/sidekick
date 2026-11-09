import { expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { flattening, parseMemoryText, readMemoryFile } from './memory-files.js';

const CLAUDE_WRITTEN = `---
name: r10
description: "R10, memory and parallel sessions"
metadata:
  node_type: memory
  kind: workstream
  status: open
  branches: "sidekick:milestone/r10-memory-and-parallel-sessions, odin:feat-x"
  type: project
  originSessionId: 0477913e-d18b-4e0a-ba46-b98ebd19d051
  modified: 2026-11-02T11:45:07.493Z
---

## State
`;

test('reads Claude Code-written front matter', () => {
  const f = parseMemoryText(CLAUDE_WRITTEN);
  expect(f?.name).toBe('r10');
  expect(f?.description).toBe('R10, memory and parallel sessions');
  expect(f?.metadata.kind).toBe('workstream');
  expect(f?.metadata.status).toBe('open');
  expect(f?.metadata.branches).toBe(
    'sidekick:milestone/r10-memory-and-parallel-sessions, odin:feat-x',
  );
  expect(f?.body.startsWith('## State')).toBe(true);
});

test('double-quoted, single-quoted, and bare branches give the same string', () => {
  const value = 'sidekick:a, odin:b';
  const forms = [`"${value}"`, `'${value}'`, value];
  for (const form of forms) {
    const f = parseMemoryText(`---\nmetadata:\n  branches: ${form}\n---\nbody`);
    expect(f?.metadata.branches).toBe(value);
  }
});

test('a double-quoted value unescapes quotes and backslashes', () => {
  const f = parseMemoryText('---\nname: "a \\"b\\" c\\\\d"\n---\n');
  expect(f?.name).toBe('a "b" c\\d');
});

test('mismatched or one-sided quotes are kept as written', () => {
  const f = parseMemoryText(`---\nname: "abc\ndescription: 'abc"\n---\n`);
  expect(f?.name).toBe('"abc');
  expect(f?.description).toBe(`'abc"`);
});

test('no front matter, or an unclosed block, gives undefined', () => {
  expect(parseMemoryText('# just a body\n')).toBeUndefined();
  expect(parseMemoryText('---\nname: x\nno closing fence\n')).toBeUndefined();
});

test('a nested block other than metadata is ignored', () => {
  const f = parseMemoryText(
    '---\nname: x\nother:\n  kind: session\nmetadata:\n  status: open\n---\n',
  );
  expect(f?.metadata).toEqual({ status: 'open' });
});

test('name and description are undefined when absent; metadata is empty', () => {
  const f = parseMemoryText('---\ntype: project\n---\nbody\n');
  expect(f?.name).toBeUndefined();
  expect(f?.description).toBeUndefined();
  expect(f?.metadata).toEqual({});
});

test('a --- line inside the body stays in the body', () => {
  const f = parseMemoryText('---\nname: x\n---\n\n\nabove\n---\nbelow\n');
  expect(f?.body).toBe('above\n---\nbelow\n');
});

test('accepts CRLF line endings', () => {
  const f = parseMemoryText(
    '---\r\nname: x\r\nmetadata:\r\n  kind: session\r\n---\r\nbody\r\n',
  );
  expect(f?.name).toBe('x');
  expect(f?.metadata.kind).toBe('session');
  expect(f?.body.startsWith('body')).toBe(true);
});

test('readMemoryFile reads a file and gives undefined for a missing one', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'memf-')));
  try {
    const file = path.join(dir, 'a.md');
    fs.writeFileSync(file, CLAUDE_WRITTEN);
    expect(readMemoryFile(file)?.name).toBe('r10');
    expect(readMemoryFile(path.join(dir, 'missing.md'))).toBeUndefined();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const FLATTENED = `---

name: alpha
description: x
metadata:
node_type: memory
type: project
kind: workstream
status: open
---

## State
`;

test('flattening names the margin keys after metadata: and the blank line', () => {
  expect(flattening(FLATTENED)).toEqual({
    keys: ['node_type', 'type', 'kind', 'status'],
    blankLine: true,
  });
});

test('flattening reports no blank line when the fence is followed by a key', () => {
  expect(flattening(FLATTENED.replace('---\n\n', '---\n'))?.blankLine).toBe(
    false,
  );
});

test('flattening gives only the margin key of a partial flattening', () => {
  const text =
    '---\nname: a\nmetadata:\n  kind: workstream\nstatus: open\n---\n';
  expect(flattening(text)).toEqual({ keys: ['status'], blankLine: false });
});

test('flattening finds nothing in a well-formed file', () => {
  expect(flattening(CLAUDE_WRITTEN)).toBeUndefined();
});

test('flattening finds nothing in the older shape with no metadata: line', () => {
  const text =
    '---\nname: a\ndescription: x\ntype: project\noriginSessionId: abc\n---\n';
  expect(flattening(text)).toBeUndefined();
});

test('flattening treats a key before metadata: as deliberate', () => {
  const text =
    '---\nname: a\ndescription: x\ntags: a\nmetadata:\n  kind: workstream\n---\n';
  expect(flattening(text)).toBeUndefined();
});

test('flattening reads a flow-style metadata value as holding no block', () => {
  const text = '---\nname: a\nmetadata: {type: project}\n---\n';
  expect(flattening(text)).toBeUndefined();
});

test('flattening finds the same keys in CRLF text', () => {
  expect(flattening(FLATTENED.replace(/\n/g, '\r\n'))).toEqual({
    keys: ['node_type', 'type', 'kind', 'status'],
    blankLine: true,
  });
});

test('flattening finds nothing in front matter that never closes', () => {
  expect(
    flattening('---\n\nname: a\nmetadata:\nkind: workstream\n'),
  ).toBeUndefined();
});

test('flattening skips name and description after metadata:', () => {
  const text =
    '---\nmetadata:\n  kind: workstream\nname: a\ndescription: x\n---\n';
  expect(flattening(text)).toBeUndefined();
});
