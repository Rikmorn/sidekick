import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  makeRunFolder,
  RUN_FOLDER_PREFIX,
  removeRunFolder,
} from './test-run-folder.js';

test(`os.tmpdir() is this run's ${RUN_FOLDER_PREFIX} folder; run bun test from the repo root, where bunfig.toml preloads bin/test-preload.ts`, () => {
  expect(path.basename(os.tmpdir()).startsWith(RUN_FOLDER_PREFIX)).toBe(true);
});

describe('removeRunFolder', () => {
  test('removes the folder and everything in it', () => {
    const dir = makeRunFolder(os.tmpdir());
    fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
    expect(removeRunFolder(dir)).toBeUndefined();
    expect(fs.existsSync(dir)).toBe(false);
  });

  test('returns a warning naming the folder when a locked subfolder blocks removal', () => {
    const dir = makeRunFolder(os.tmpdir());
    const locked = path.join(dir, 'locked');
    fs.mkdirSync(path.join(locked, 'inner'), { recursive: true });
    fs.chmodSync(locked, 0o555);
    try {
      expect(removeRunFolder(dir)).toContain(dir);
    } finally {
      fs.chmodSync(locked, 0o755);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
