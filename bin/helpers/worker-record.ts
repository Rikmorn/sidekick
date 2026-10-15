/**
 * The record `sidekick worker dispatch` leaves for each worker it starts, at
 * `<common git dir>/sidekick/workers/<name>.json`. `finish` removes it, and
 * `sidekick desk` reads it to list the dispatched workers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { WorkerNameSchema } from './worker-brief.js';

const RecordSchema = v.strictObject({
  version: v.literal(1),
  name: WorkerNameSchema,
  job: v.nullable(v.string()),
  brief: v.string(),
  dispatchedAt: v.string(),
});

export type WorkerRecord = v.InferOutput<typeof RecordSchema>;

// Checked on every write and removal too, so a name from any caller cannot
// reach outside the records folder.
const isWorkerName = (name: string): boolean => v.is(WorkerNameSchema, name);

/** `<commonDir>/sidekick/workers` */
export function recordsDir(commonDir: string): string {
  return path.join(commonDir, 'sidekick', 'workers');
}

const RECORD_SUFFIX = '.json';

const fileFor = (commonDir: string, name: string): string =>
  path.join(recordsDir(commonDir), `${name}${RECORD_SUFFIX}`);

/**
 * The job id on `claude --bg`'s `backgrounded · <id> · <name>` line for this
 * name, else null. Measured on Claude Code 2.1.300: the dispatch of this
 * plan's own worker printed `backgrounded · e21776e8 · p7-desk`. The listing
 * is a research preview, so a bare `backgrounded <id>` line, with no name, also
 * counts when it is the only `backgrounded` line.
 */
export function jobIdFrom(stdout: string, name: string): string | null {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^backgrounded\b/.test(line));
  for (const line of lines) {
    const named = /^backgrounded · (\S+) · (.+)$/.exec(line);
    if (named?.[2] === name) return named[1];
  }
  if (lines.length !== 1) return null;
  return /^backgrounded (\S+)$/.exec(lines[0])?.[1] ?? null;
}

const reason = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/** Writes `<recordsDir>/<name>.json`, creating folders. Returns an issue instead of throwing. */
export function writeRecord(
  commonDir: string,
  record: WorkerRecord,
): { ok: true } | { issue: string } {
  if (!isWorkerName(record.name)) {
    return { issue: `worker record not written: bad name "${record.name}"` };
  }
  const file = fileFor(commonDir, record.name);
  try {
    fs.mkdirSync(recordsDir(commonDir), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
    return { ok: true };
  } catch (e) {
    return { issue: `worker record ${file} not written: ${reason(e)}` };
  }
}

// The record in one file, or why it does not parse. Its name must be the
// file's, since pruning removes the file its name picks.
function parseRecord(file: string): WorkerRecord | string {
  try {
    const parsed = v.safeParse(
      RecordSchema,
      JSON.parse(fs.readFileSync(file, 'utf-8')),
    );
    if (!parsed.success) {
      return `${file} is not a worker record: ${parsed.issues[0].message}`;
    }
    const base = path.basename(file, RECORD_SUFFIX);
    if (parsed.output.name !== base) {
      return `${file} holds the record of "${parsed.output.name}", not of "${base}"`;
    }
    return parsed.output;
  } catch (e) {
    return `${file} cannot be read as a worker record: ${reason(e)}`;
  }
}

/** Every valid record, and a warning per file that does not parse or holds another name than its own. A missing folder is no records. */
export function readRecords(commonDir: string): {
  records: WorkerRecord[];
  warnings: string[];
} {
  const dir = recordsDir(commonDir);
  const records: WorkerRecord[] = [];
  const warnings: string[] = [];
  let files: string[];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(RECORD_SUFFIX))
      .sort();
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
      return { records, warnings };
    }
    return { records, warnings: [`${dir} cannot be listed: ${reason(e)}`] };
  }
  for (const f of files) {
    const read = parseRecord(path.join(dir, f));
    if (typeof read === 'string') warnings.push(read);
    else records.push(read);
  }
  return { records, warnings };
}

/** Removes the named record. A missing file is fine. */
export function removeRecord(commonDir: string, name: string): void {
  if (!isWorkerName(name)) return;
  fs.rmSync(fileFor(commonDir, name), { force: true });
}
