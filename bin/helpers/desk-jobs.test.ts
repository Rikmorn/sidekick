import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJobStates } from './desk-jobs.js';
import type { ListingRow } from './desk-snapshot.js';
import { removeTemps, tmp } from './fixtures/worker/repo.js';

afterEach(removeTemps);

const row = (over: ListingRow = {}): ListingRow => ({
  id: 'aaaa0001',
  kind: 'background',
  name: 'w1',
  state: 'working',
  ...over,
});

// Writes `<configDir>/jobs/<id>/state.json`; the text is raw so a test can break it.
function jobFile(configDir: string, id: string, text: string): void {
  const dir = path.join(configDir, 'jobs', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), text);
}

describe('readJobStates', () => {
  test('takes detail always and ignores the file’s other keys', () => {
    const configDir = tmp();
    jobFile(
      configDir,
      'aaaa0001',
      JSON.stringify({ detail: 'running tests', needs: 'a yes', other: 1 }),
    );
    const read = readJobStates(configDir, [row()]);
    expect(read.states.get('aaaa0001')).toEqual({ detail: 'running tests' });
    expect(read.warnings).toEqual([]);
  });

  test('takes needs only while the listing reads blocked', () => {
    const configDir = tmp();
    jobFile(configDir, 'aaaa0001', '{"detail":"d","needs":"a yes"}');
    const read = readJobStates(configDir, [row({ state: 'blocked' })]);
    expect(read.states.get('aaaa0001')).toEqual({
      detail: 'd',
      needs: 'a yes',
    });
  });

  test('a missing folder or file adds nothing and warns nothing', () => {
    const configDir = tmp();
    fs.mkdirSync(path.join(configDir, 'jobs', 'aaaa0002'), { recursive: true });
    const read = readJobStates(configDir, [
      row(),
      row({ id: 'aaaa0002' }),
      row({ id: undefined, kind: 'interactive' }),
    ]);
    expect([...read.states]).toEqual([]);
    expect(read.warnings).toEqual([]);
  });

  test('reads only background rows with an id that names a folder', () => {
    const configDir = tmp();
    jobFile(configDir, 'bbbb0001', '{"detail":"d"}');
    const read = readJobStates(configDir, [
      row({ id: 'bbbb0001', kind: 'interactive' }),
      row({ id: '../jobs/bbbb0001' }),
    ]);
    expect([...read.states]).toEqual([]);
    expect(read.warnings).toEqual([]);
  });

  test('a file that is not JSON adds one warning and no state', () => {
    const configDir = tmp();
    jobFile(configDir, 'aaaa0001', 'not json');
    const read = readJobStates(configDir, [row()]);
    expect([...read.states]).toEqual([]);
    expect(read.warnings).toEqual(['w1: its job state is not JSON']);
  });

  test('a detail or needs of another type drops the field, with one line per file', () => {
    const configDir = tmp();
    jobFile(configDir, 'aaaa0001', '{"detail":4,"needs":["x"]}');
    const read = readJobStates(configDir, [row({ state: 'blocked' })]);
    expect(read.states.get('aaaa0001')).toEqual({});
    expect(read.warnings).toEqual([
      'w1: its job state changed shape: detail is not a string, needs is not a string',
    ]);
  });

  test('a needs of another type is ignored while the listing is not blocked', () => {
    const configDir = tmp();
    jobFile(configDir, 'aaaa0001', '{"detail":"d","needs":4}');
    const read = readJobStates(configDir, [row()]);
    expect(read.states.get('aaaa0001')).toEqual({ detail: 'd' });
    expect(read.warnings).toEqual([]);
  });

  test('a JSON value that is not an object counts as a shape change', () => {
    const configDir = tmp();
    jobFile(configDir, 'aaaa0001', '[]');
    const read = readJobStates(configDir, [row()]);
    expect(read.warnings).toEqual(['w1: its job state is not a JSON object']);
  });
});
