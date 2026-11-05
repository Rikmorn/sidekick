/**
 * The exclude entry for Claude Code's worktree folder: dispatch adds it to
 * `<commonDir>/info/exclude` unless git already ignores that folder.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';
import { WORKTREES_FOLDER } from './worker-repo.js';

const EXCLUDE_ENTRY = `${WORKTREES_FOLDER}/`;

// Whether git already ignores the worktrees folder; the probe path need not exist.
const isIgnored = (runGit: Runner, top: string): boolean =>
  runGit(
    'git',
    ['check-ignore', '-q', '--no-index', `${WORKTREES_FOLDER}/x`],
    top,
  ).code === 0;

const reason = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const isMissing = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === 'ENOENT';

// The file's text, empty when it does not exist; any other failure is an issue.
function readExclude(file: string): { text: string } | { issues: string[] } {
  try {
    return { text: fs.readFileSync(file, 'utf-8') };
  } catch (e) {
    if (isMissing(e)) return { text: '' };
    return {
      issues: [
        `cannot read ${file}, where dispatch adds ${EXCLUDE_ENTRY}: ${reason(e)}. Fix the file, then run dispatch again`,
      ],
    };
  }
}

// Keeps the file's last line whole.
function appendExclude(file: string, text: string): string[] {
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${separator}${EXCLUDE_ENTRY}\n`);
    return [];
  } catch (e) {
    return [
      `cannot add ${EXCLUDE_ENTRY} to ${file}: ${reason(e)}. Fix the file, then run dispatch again`,
    ];
  }
}

/**
 * Appends `.claude/worktrees/` to `<commonDir>/info/exclude` unless git already
 * ignores that folder, creating `info/` when missing and keeping the file's
 * last line whole. Gives the line to print when it writes, or the issue when
 * it cannot read or write the file.
 */
export function ensureWorktreesExcluded(
  runGit: Runner,
  top: string,
  commonDir: string,
): { line: string | undefined } | { issues: string[] } {
  if (isIgnored(runGit, top)) return { line: undefined };
  const file = path.join(commonDir, 'info', 'exclude');
  const read = readExclude(file);
  if ('issues' in read) return read;
  // An entry that a later .gitignore negation overrides is not added twice.
  if (read.text.split(/\r?\n/).includes(EXCLUDE_ENTRY)) {
    return { line: undefined };
  }
  const issues = appendExclude(file, read.text);
  if (issues.length > 0) return { issues };
  return { line: `added ${EXCLUDE_ENTRY} to ${file}` };
}
