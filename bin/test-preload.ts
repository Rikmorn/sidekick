/**
 * Preloaded by bunfig.toml before every test file: the run keeps its temp
 * folders in one folder, removed after the last file. A `node:child_process`
 * child started without an `env` option keeps the original temp folder.
 */
import { afterAll } from 'bun:test';
import * as os from 'node:os';
import { makeRunFolder, removeRunFolder } from './test-run-folder.js';

const runFolder = makeRunFolder(os.tmpdir());
process.env.TMPDIR = runFolder;

afterAll(() => {
  const warning = removeRunFolder(runFolder);
  if (warning !== undefined) console.warn(warning);
});
