import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readStoreSettings } from './memory-store-settings.js';

let store = '';

beforeEach(() => {
  store = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'mem-settings-')),
  );
});

afterEach(() => {
  fs.rmSync(store, { recursive: true, force: true });
});

function writeSettings(text: string): void {
  fs.writeFileSync(path.join(store, 'settings.json'), text);
}

describe('readStoreSettings', () => {
  test('an absent file gives the defaults and no issue', () => {
    expect(readStoreSettings(store)).toEqual({
      settings: { indexLineLength: 300 },
    });
  });

  test('a valid file gives its values', () => {
    writeSettings('{ "indexLineCap": 80, "indexLineLength": 200 }');
    expect(readStoreSettings(store)).toEqual({
      settings: { indexLineCap: 80, indexLineLength: 200 },
    });
  });

  test('a file that sets only the cap keeps the default line length', () => {
    writeSettings('{ "indexLineCap": 80 }');
    expect(readStoreSettings(store)).toEqual({
      settings: { indexLineCap: 80, indexLineLength: 300 },
    });
  });

  test('a file that is not JSON gives the defaults and an issue', () => {
    writeSettings('{ indexLineCap: 80 }');
    const read = readStoreSettings(store);
    expect(read.settings).toEqual({ indexLineLength: 300 });
    expect(read.issue).toStartWith('not valid JSON: ');
  });

  test.each([
    ['zero', '{ "indexLineCap": 0 }', 'indexLineCap'],
    ['negative', '{ "indexLineLength": -5 }', 'indexLineLength'],
    ['fractional', '{ "indexLineCap": 1.5 }', 'indexLineCap'],
    ['a string', '{ "indexLineLength": "300" }', 'indexLineLength'],
    // Fails two steps of the pipe, and is still named once.
    ['negative fractional', '{ "indexLineCap": -1.5 }', 'indexLineCap'],
  ])('a %s value gives the defaults and an issue naming its key', (_, text, key) => {
    writeSettings(text);
    expect(readStoreSettings(store)).toEqual({
      settings: { indexLineLength: 300 },
      issue: `${key} must be a positive integer`,
    });
  });

  test('two bad values are both named', () => {
    writeSettings('{ "indexLineCap": 0, "indexLineLength": "x" }');
    expect(readStoreSettings(store).issue).toBe(
      'indexLineCap must be a positive integer; indexLineLength must be a positive integer',
    );
  });

  test.each([
    ['an array', '[80]'],
    ['null', 'null'],
  ])('%s at the top gives the defaults and an issue', (_, text) => {
    writeSettings(text);
    expect(readStoreSettings(store)).toEqual({
      settings: { indexLineLength: 300 },
      issue: 'the file must hold a JSON object',
    });
  });

  test('a settings path that is a folder gives the defaults and an issue', () => {
    fs.mkdirSync(path.join(store, 'settings.json'));
    const read = readStoreSettings(store);
    expect(read.settings).toEqual({ indexLineLength: 300 });
    expect(read.issue).toStartWith('cannot be read');
  });
});
