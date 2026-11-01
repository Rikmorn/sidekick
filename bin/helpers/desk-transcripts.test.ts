import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { firstPlace } from './desk-transcripts.js';
import { removeTemps, tmp } from './fixtures/worker/repo.js';

afterEach(removeTemps);

const line = (entry: object): string => `${JSON.stringify(entry)}\n`;

function transcript(text: string): string {
  const file = path.join(tmp(), 's.jsonl');
  fs.writeFileSync(file, text);
  return file;
}

describe('firstPlace', () => {
  test('skips entries with no cwd and returns the first that has one', () => {
    const file = transcript(
      line({ type: 'queue-operation' }) +
        line({ type: 'queue-operation', operation: 'dequeue' }) +
        line({ cwd: '/w/one', gitBranch: 'feat' }) +
        line({ cwd: '/w/two', gitBranch: 'other' }),
    );
    expect(firstPlace(file)).toEqual({ cwd: '/w/one', gitBranch: 'feat' });
  });

  test('gives an undefined gitBranch when the entry has none', () => {
    const file = transcript(line({ cwd: '/w/one' }));
    expect(firstPlace(file)).toEqual({ cwd: '/w/one', gitBranch: undefined });
  });

  test('reads a gitBranch of HEAD, a detached HEAD, as no branch', () => {
    const file = transcript(line({ cwd: '/w/one', gitBranch: 'HEAD' }));
    expect(firstPlace(file)).toEqual({ cwd: '/w/one', gitBranch: undefined });
  });

  test('reads an empty gitBranch as no branch', () => {
    const file = transcript(line({ cwd: '/w/one', gitBranch: '' }));
    expect(firstPlace(file)).toEqual({ cwd: '/w/one', gitBranch: undefined });
  });

  test('never parses a line that crosses the bound', () => {
    const first = line({ type: 'x' });
    const file = transcript(first + line({ cwd: '/w/long', gitBranch: 'b' }));
    expect(firstPlace(file, first.length + 10)).toBeUndefined();
    expect(firstPlace(file)).toEqual({ cwd: '/w/long', gitBranch: 'b' });
  });

  test('a line ending exactly at the bound is whole', () => {
    const text = line({ cwd: '/w/a' });
    expect(firstPlace(transcript(text), text.length)).toEqual({
      cwd: '/w/a',
      gitBranch: undefined,
    });
  });

  test('cuts inside a multi-byte character without parsing the partial line', () => {
    const first = line({ type: 'x' });
    const file = transcript(first + line({ cwd: '/w/é', gitBranch: 'b' }));
    const cut = first.length + Buffer.byteLength('{"cwd":"/w/é') - 1;
    expect(firstPlace(file, cut)).toBeUndefined();
  });

  test('a file with one line and no final newline, under the bound, is whole', () => {
    const file = transcript(JSON.stringify({ cwd: '/w/a', gitBranch: 'b' }));
    expect(firstPlace(file)).toEqual({ cwd: '/w/a', gitBranch: 'b' });
  });

  test('a final line with no newline is ignored once the file reaches the bound', () => {
    const text = JSON.stringify({ cwd: '/w/a' });
    expect(firstPlace(transcript(text), text.length)).toBeUndefined();
  });

  test('skips malformed lines and entries whose cwd is not a non-empty string', () => {
    const file = transcript(
      'not json\n' +
        '[1,2]\n' +
        'null\n' +
        line({ cwd: 7 }) +
        line({ cwd: '' }) +
        line({ cwd: '/w/ok', gitBranch: 7 }),
    );
    expect(firstPlace(file)).toEqual({ cwd: '/w/ok', gitBranch: undefined });
  });

  test('gives undefined for a missing file, an empty file, and no cwd', () => {
    expect(firstPlace(path.join(tmp(), 'missing.jsonl'))).toBeUndefined();
    expect(firstPlace(transcript(''))).toBeUndefined();
    expect(firstPlace(transcript(line({ type: 'x' })))).toBeUndefined();
  });
});
