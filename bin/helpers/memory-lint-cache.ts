/**
 * The memory lint's cache: the last whole-store lint, which the snapshot
 * child writes after its commit and the memory start hook reads. It lives in
 * the store's git directory, which `git add -A` never stages.
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import {
  MEMORY_LINT_IDS,
  type MemoryFinding,
  type MemoryLintResult,
} from './memory-lint.js';
import { isWorkTreeTop } from './memory-store.js';
import type { Runner } from './pm-data.js';

const CACHE_FILE = 'sidekick-lint.json';
const CACHE_VERSION = 1;

const lintId = v.picklist(MEMORY_LINT_IDS);

// Typed as MemoryFinding, so the schema and the lint's own type cannot drift apart.
const FindingSchema: v.GenericSchema<MemoryFinding> = v.object({
  id: lintId,
  folder: v.string(),
  file: v.string(),
  line: v.optional(v.number()),
  message: v.string(),
});

// A file that fails this schema reads as no cache.
const LintCacheSchema = v.object({
  version: v.literal(CACHE_VERSION),
  ranAt: v.pipe(v.string(), v.isoTimestamp()),
  findings: v.array(FindingSchema),
  counts: v.record(lintId, v.pipe(v.number(), v.integer(), v.minValue(0))),
});
export type LintCache = v.InferOutput<typeof LintCacheSchema>;

/**
 * The cache's absolute path, from `git rev-parse --git-path`. Undefined when
 * `store` is not a git work tree's top, so the path never resolves into an
 * enclosing repo's git directory, and when git fails.
 */
export function cachePath(store: string, runGit: Runner): string | undefined {
  if (!isWorkTreeTop(store, runGit)) return undefined;
  const r = runGit('git', ['rev-parse', '--git-path', CACHE_FILE], store);
  const found = r.stdout.trim();
  if (r.code !== 0 || found === '') return undefined;
  return path.resolve(store, found);
}

/**
 * Writes `result` to `file` through a temporary file in the same folder and a
 * rename, so a reader sees the old cache or the new one whole. A failed write
 * removes its temporary file and throws.
 */
export function writeCache(
  file: string,
  result: MemoryLintResult,
  ranAt: Date,
): void {
  const cache: LintCache = {
    version: CACHE_VERSION,
    ranAt: ranAt.toISOString(),
    findings: result.findings,
    counts: result.counts,
  };
  // Unique per writer, since two sessions' snapshots can write at once.
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(cache)}\n`);
    fs.renameSync(temp, file);
  } catch (error) {
    removeQuietly(temp);
    throw error;
  }
}

// A removal that fails would hide the error that led to it.
function removeQuietly(file: string): void {
  try {
    fs.rmSync(file, { force: true });
  } catch {}
}

/** The cache at `file`, or undefined when it is missing, unreadable, not JSON, or fails the schema. */
export function readCache(file: string): LintCache | undefined {
  try {
    const parsed = v.safeParse(
      LintCacheSchema,
      JSON.parse(fs.readFileSync(file, 'utf8')),
    );
    return parsed.success ? parsed.output : undefined;
  } catch {
    return undefined;
  }
}
