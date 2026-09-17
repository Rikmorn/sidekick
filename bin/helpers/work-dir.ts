/**
 * #28 — resolve a GitHub issue number to its work directory.
 *
 * Work lives at `.sidekick/work/<issue>-<slug>/`. The issue number is the
 * identity; the slug is a readable label that may go stale when an issue is
 * retitled, so resolution matches on the number and the separator only.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export class WorkDirError extends Error {
  constructor(
    readonly kind: 'not_found' | 'ambiguous',
    message: string,
  ) {
    super(message);
    this.name = 'WorkDirError';
  }
}

export function resolveWorkDir(
  repoRoot: string,
  issue: number,
): { dir: string; rfcPath: string } {
  const workRoot = path.join(repoRoot, '.sidekick', 'work');
  const prefix = `${issue}-`;
  let entries: string[] = [];
  try {
    entries = fs
      .readdirSync(workRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
      .map((e) => e.name);
  } catch {
    // missing work root reads the same as no match
  }
  if (entries.length === 0) {
    throw new WorkDirError(
      'not_found',
      `No work directory for issue ${issue} under ${workRoot}`,
    );
  }
  if (entries.length > 1) {
    throw new WorkDirError(
      'ambiguous',
      `Issue ${issue} matches ${entries.length} directories: ${entries.sort().join(', ')}`,
    );
  }
  const dir = path.join(workRoot, entries[0] as string);
  return { dir, rfcPath: path.join(dir, 'RFC.md') };
}
