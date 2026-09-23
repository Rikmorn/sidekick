import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Vale reads a non-file argument as text and waits on stdin with none.

const VALE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  '.bin',
  'vale',
);

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('prose: name at least one Markdown file or directory');
  process.exit(2);
}
const missing = paths.filter((p) => !fs.existsSync(p));
if (missing.length > 0) {
  console.error(`prose: no such file: ${missing.join(', ')}`);
  process.exit(2);
}
const run = spawnSync(VALE, paths, { stdio: 'inherit' });
if (run.error) {
  console.error(`prose: cannot run Vale at ${VALE}: ${run.error.message}`);
  process.exit(2);
}
process.exit(run.status ?? 2);
