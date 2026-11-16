/**
 * A loop's unit ledger: what its record says about attempts, caps, the
 * working-time clock, and the failure breaker. Every count is a pure function
 * of the record's lines; only `readLedger` and the worker file touch disk.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { localDate } from './local-date.js';
import type { LoopManifest } from './loop-manifest.js';
import { IsoUtcSchema, type RecordLine, readDayFiles } from './loop-record.js';
import { writeWhole } from './loop-state.js';
import {
  isFolderSafeUnitId,
  UnitIdSchema,
  WorkerNameSchema,
} from './worker-brief.js';

/** The folder under a loop's folder that holds each unit's attempts. */
export const UNITS_DIR = 'units';
/** The per-loop lock the verbs that write verb lines take, beside `start.lock`. */
export const UNITS_LOCK = 'units.lock';

/** The file in an attempt's folder that names its worker, job, and issue. */
export const WORKER_FILE = 'worker.json';

const RECORDS_DIR = 'records';
const DAY_FILE = /^(\d{4})-(\d{2})-(\d{2})\.jsonl$/;
const MINUTE_MS = 60_000;

type Caps = LoopManifest['caps'];

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const issuesOf = (issues: v.BaseIssue<unknown>[]): string[] =>
  issues.map((issue) => `${v.getDotPath(issue) ?? 'value'}: ${issue.message}`);

/** What refuses a unit id: the record's rule, and `.` and `..`, which name folders. */
export function unitIdIssues(id: string): string[] {
  const parsed = v.safeParse(UnitIdSchema, id);
  if (!parsed.success) return parsed.issues.map((i) => `unit: ${i.message}`);
  return isFolderSafeUnitId(id)
    ? []
    : [`unit: ${id} names a folder, not a unit`];
}

/** `<skill part>-<issue>`, where the skill part is the text after `:`. */
export function deriveUnitId(skill: string, issue: number): string {
  const part = skill.slice(skill.indexOf(':') + 1);
  return `${part}-${issue}`;
}

/** `<loopDir>/units/<unit>/<worker>`; the caller has checked `unit` with `unitIdIssues`. */
export function attemptDir(
  loopDir: string,
  unit: string,
  worker: string,
): string {
  return path.join(loopDir, UNITS_DIR, unit, worker);
}

/** What `worker.json` names about one attempt. */
export const WorkerFileSchema = v.strictObject({
  v: v.literal(1),
  worker: WorkerNameSchema,
  job: v.nullable(v.string()),
  issue: v.pipe(v.number(), v.integer(), v.minValue(1)),
  dispatchedAt: IsoUtcSchema,
});
export type WorkerFile = v.InferOutput<typeof WorkerFileSchema>;

/** The attempt's `worker.json`, or the reasons it cannot be read. */
export function readWorkerFile(dir: string): WorkerFile | { issues: string[] } {
  const file = path.join(dir, WORKER_FILE);
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { issues: [`${file}: ${messageOf(e)}`] };
  }
  const parsed = v.safeParse(WorkerFileSchema, json);
  return parsed.success
    ? parsed.output
    : { issues: issuesOf(parsed.issues).map((i) => `${file}: ${i}`) };
}

/** Writes `worker.json` into `dir`; returns the reasons it refused, none on success. A refusal writes nothing. */
export function writeWorkerFile(dir: string, file: WorkerFile): string[] {
  const parsed = v.safeParse(WorkerFileSchema, file);
  if (!parsed.success) return issuesOf(parsed.issues);
  try {
    fs.mkdirSync(dir, { recursive: true });
    return writeWhole(path.join(dir, WORKER_FILE), parsed.output);
  } catch (e) {
    return [`${path.join(dir, WORKER_FILE)}: ${messageOf(e)}`];
  }
}

function dayFiles(loopDir: string): string[] | { issue: string } {
  const dir = path.join(loopDir, RECORDS_DIR);
  try {
    return fs.readdirSync(dir).filter((name) => DAY_FILE.test(name));
  } catch (e) {
    return e instanceof Error && 'code' in e && e.code === 'ENOENT'
      ? []
      : { issue: `${dir}: cannot list the records: ${messageOf(e)}` };
  }
}

// Local midnight of a day file's date, built with the local constructor as `readRecords` walks days.
function dayOf(name: string): Date {
  const match = DAY_FILE.exec(name);
  const [year = 0, month = 1, day = 1] = (match?.slice(1) ?? []).map(Number);
  return new Date(year, month - 1, day);
}

// A name such as `2026-02-30.jsonl` reads as another day, whose file would
// then be read in its place, so it must name the day it reads as.
function unrealDayIssues(loopDir: string, names: string[]): string[] {
  return names
    .filter((name) => `${localDate(dayOf(name))}.jsonl` !== name)
    .map(
      (name) =>
        `${path.join(loopDir, RECORDS_DIR, name)}: the name is no real date, so sidekick cannot tell which day the file holds`,
    );
}

/**
 * Every line of every day file in `records/`, whatever the date its name
 * carries, with `at` up to `now`, oldest first. A line that does not parse is
 * skipped, as `readRecords` does. Refuses when the folder cannot be listed,
 * any day file is unreadable, or a day file's name is no real date, since a
 * count that skips a file undercounts.
 */
export function readLedger(
  loopDir: string,
  now: Date,
): { lines: RecordLine[] } | { issues: string[] } {
  const names = dayFiles(loopDir);
  if ('issue' in names) return { issues: [names.issue] };
  if (names.length === 0) return { lines: [] };
  const unreal = unrealDayIssues(loopDir, names);
  const read = readDayFiles(
    loopDir,
    names.map((name) => dayOf(name)),
  );
  const issues = [...unreal, ...read.unreadable];
  return issues.length > 0
    ? { issues }
    : {
        lines: read.lines.filter(
          (line) => Date.parse(line.at) <= now.getTime(),
        ),
      };
}

/** One dispatched worker's attempt at a unit. */
export type Attempt = {
  unit: string;
  worker: string;
  dispatchedAt: Date;
  record: boolean;
};

/**
 * The attempt in flight: opened by `dispatched`, closed by the next `landed`,
 * `failed`, or `discarded` for its unit that names its worker or no worker.
 * With more than one open, which `dispatch` prevents, the newest.
 */
export function inFlight(lines: RecordLine[]): Attempt | undefined {
  const open = lines.reduce<Attempt[]>((attempts, line) => {
    if (line.kind === 'dispatched') {
      attempts.push({
        unit: line.unit,
        worker: line.worker ?? '',
        dispatchedAt: new Date(line.at),
        record: line.record === true,
      });
      return attempts;
    }
    if (
      line.kind === 'landed' ||
      line.kind === 'failed' ||
      line.kind === 'discarded'
    ) {
      const worker = 'worker' in line ? line.worker : undefined;
      return attempts.filter(
        (a) =>
          !(
            a.unit === line.unit &&
            (worker === undefined || worker === a.worker)
          ),
      );
    }
    return attempts;
  }, []);
  return open.at(-1);
}

/** `failed` lines across units since the later of the last `landed` and the last `resumed`. */
export function failedInARow(lines: RecordLine[]): number {
  return lines.reduce(
    (count, line) =>
      line.kind === 'landed' || line.kind === 'resumed'
        ? 0
        : line.kind === 'failed'
          ? count + 1
          : count,
    0,
  );
}

/** True when the run of failed units has reached `failedUnitsInARow`. */
export function breakerTripped(lines: RecordLine[], caps: Caps): boolean {
  return failedInARow(lines) >= caps.failedUnitsInARow;
}

/**
 * Every cap that is at its limit, each with its count and the way out.
 * `loopName` words the breaker's resume command.
 */
export function capIssues(
  lines: RecordLine[],
  caps: Caps,
  unit: string,
  now: Date,
  loopName: string,
): string[] {
  const dispatches = lines.filter((line) => line.kind === 'dispatched');
  const attempts = dispatches.filter(
    (line) => line.unit === unit && line.record !== true,
  ).length;
  const today = localDate(now);
  const todays = dispatches.filter(
    (line) => localDate(new Date(line.at)) === today,
  ).length;
  const issues: string[] = [];
  if (attempts >= caps.attemptsPerUnit) {
    issues.push(
      `attemptsPerUnit: ${unit} has ${attempts} attempts, the cap is ${caps.attemptsPerUnit}; the operator raises the cap in loop.json or leaves the unit`,
    );
  }
  if (todays >= caps.unitsPerDay) {
    issues.push(
      `unitsPerDay: ${todays} units dispatched today, the cap is ${caps.unitsPerDay}; dispatch resumes tomorrow`,
    );
  }
  if (breakerTripped(lines, caps)) {
    issues.push(
      `failedUnitsInARow: ${failedInARow(lines)} units failed in a row, the cap is ${caps.failedUnitsInARow}; run sidekick loop resume ${loopName} --reason <text> once the cause is fixed`,
    );
  }
  return issues;
}

/**
 * Minutes the attempt has worked: wall time since dispatch, less its waits.
 * A wait opens at a `request` for the unit and closes at the `answered` line
 * for the unit and worker, or runs to `now`. Waits count only up to
 * `waitMinutesPerUnit` in total, so an attempt runs at most the work cap plus
 * the wait cap, whatever the model writes.
 */
export function workingMinutes(
  lines: RecordLine[],
  attempt: Attempt,
  caps: Caps,
  now: Date,
): number {
  const start = attempt.dispatchedAt.getTime();
  const end = now.getTime();
  const waited = lines
    .filter((line) => {
      const time = Date.parse(line.at);
      return time >= start && time <= end;
    })
    .reduce<{ total: number; since: number | undefined }>(
      (acc, line) => {
        const time = Date.parse(line.at);
        if (
          line.kind === 'request' &&
          line.unit === attempt.unit &&
          acc.since === undefined
        ) {
          return { total: acc.total, since: time };
        }
        if (
          line.kind === 'answered' &&
          line.unit === attempt.unit &&
          line.worker === attempt.worker &&
          acc.since !== undefined
        ) {
          return { total: acc.total + (time - acc.since), since: undefined };
        }
        return acc;
      },
      { total: 0, since: undefined },
    );
  const open = waited.since === undefined ? 0 : end - waited.since;
  const counted = Math.min(
    waited.total + open,
    caps.waitMinutesPerUnit * MINUTE_MS,
  );
  return (end - start - counted) / MINUTE_MS;
}
