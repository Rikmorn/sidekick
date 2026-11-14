/**
 * A loop's record: one JSON line per entry in `<loop folder>/records/<local YYYY-MM-DD>.jsonl`.
 * The schema is the one source of each kind's fields; `RecordLine` is inferred from it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { localDate } from './local-date.js';
import { type Cron, previousFire } from './loop-cron.js';

/** The kinds the model writes through `sidekick loop record`. */
export const MODEL_KINDS = [
  'would',
  'request',
  'did',
  'denied',
  'note',
] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

const RECORDS_DIR = 'records';
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const FALLBACK_WINDOW_DAYS = 366;

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const at = v.pipe(
  v.string(),
  v.check(
    (s) => ISO_UTC.test(s) && !Number.isNaN(Date.parse(s)),
    'must be an ISO 8601 UTC time',
  ),
);
const LAST_C0 = 0x1f;
const DEL = 0x7f;
const NEWLINE = 0x0a;

// A C0 control or DEL reaches a terminal as a command, so a printed line could hide the lines before it.
const isControl = (ch: string): boolean => {
  const code = ch.charCodeAt(0);
  return code <= LAST_C0 || code === DEL;
};
const plain = v.check(
  (s: string) => ![...s].some(isControl),
  'must hold no control character (U+0000 to U+001F, or U+007F)',
);

const summary = v.pipe(v.string(), v.minLength(1), v.maxLength(1000), plain);
const command = v.pipe(v.string(), v.minLength(1), v.maxLength(4000), plain);
const className = v.pipe(v.string(), v.minLength(1), plain);
const unit = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9._-]{1,64}$/, 'must be 1 to 64 of A-Z a-z 0-9 . _ -'),
);
const hash = v.pipe(v.string(), v.minLength(1));
const reason = v.pipe(v.string(), v.minLength(1), v.maxLength(1000), plain);
// 40 hex characters is a SHA-1 object id, and 64 a SHA-256 one.
const commit = v.pipe(
  v.string(),
  v.regex(/^[0-9a-f]{7,64}$/i, 'must be a hex object id of 7 to 64 characters'),
);

// Plain objects, so a newer writer's extra field is stripped and the line still reads.
const head = { v: v.literal(1), at };

/** One line of a loop's record; the variant on `kind` holds each kind's fields. */
export const RecordLineSchema = v.variant('kind', [
  v.object({
    ...head,
    kind: v.literal('would'),
    summary,
    class: className,
    command,
    unit: v.optional(unit),
    hash: v.optional(hash),
  }),
  v.object({
    ...head,
    kind: v.literal('request'),
    summary,
    command,
    class: v.optional(className),
    unit: v.optional(unit),
    hash: v.optional(hash),
  }),
  v.object({
    ...head,
    kind: v.literal('did'),
    summary,
    class: className,
    command,
    unit: v.optional(unit),
    hash: v.optional(hash),
  }),
  v.object({
    ...head,
    kind: v.literal('denied'),
    summary,
    command,
    class: v.optional(className),
    unit: v.optional(unit),
    hash: v.optional(hash),
  }),
  v.object({
    ...head,
    kind: v.literal('note'),
    summary,
    unit: v.optional(unit),
    hash: v.optional(hash),
  }),
  v.object({
    ...head,
    kind: v.literal('dispatched'),
    unit,
    record: v.optional(v.literal(true)),
  }),
  v.object({ ...head, kind: v.literal('landed'), unit, commit }),
  v.object({ ...head, kind: v.literal('failed'), unit, reason }),
  v.object({ ...head, kind: v.literal('discarded'), unit, reason }),
]);
export type RecordLine = v.InferOutput<typeof RecordLineSchema>;

/** The file that holds lines written at `at`: `<loopDir>/records/<local date>.jsonl`. */
export function recordFile(loopDir: string, at: Date): string {
  return path.join(loopDir, RECORDS_DIR, `${localDate(at)}.jsonl`);
}

const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const isMissing = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === 'ENOENT';

// True when `file` holds bytes and the last is not a newline, as a write cut short leaves it.
function endsMidLine(file: string): boolean {
  const size = fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0;
  if (size === 0) return false;
  const last = Buffer.alloc(1);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, last, 0, 1, size - 1);
  } finally {
    fs.closeSync(fd);
  }
  return last[0] !== NEWLINE;
}

/**
 * Appends `line` to the file of its own local date, in one write; makes
 * `records/` when absent. After a torn last line it starts a new line, so the
 * torn one alone is lost. Throws when `line` fails `RecordLineSchema`, naming
 * each issue, since the reader would skip it.
 */
export function appendRecord(loopDir: string, line: RecordLine): void {
  const parsed = v.safeParse(RecordLineSchema, line);
  if (!parsed.success) {
    const issues = parsed.issues.map(
      (issue) => `${v.getDotPath(issue) ?? 'kind'}: ${issue.message}`,
    );
    throw new Error(
      `the record line does not fit the schema: ${issues.join('; ')}`,
    );
  }
  const file = recordFile(loopDir, new Date(parsed.output.at));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lead = endsMidLine(file) ? '\n' : '';
  fs.appendFileSync(file, `${lead}${JSON.stringify(parsed.output)}\n`);
}

/** What a read found: the lines, the count it skipped, and each day file it could not read, as `<file>: <why>`. */
export type RecordRead = {
  lines: RecordLine[];
  skipped: number;
  unreadable: string[];
};

function parseLine(text: string): RecordLine | undefined {
  try {
    const parsed = v.safeParse(RecordLineSchema, JSON.parse(text));
    return parsed.success ? parsed.output : undefined;
  } catch {
    return undefined;
  }
}

// Each local day built with the local constructor, so a daylight-saving day is still one file.
function localDays(since: Date, until: Date): Date[] {
  const days: Date[] = [];
  for (
    let day = new Date(since.getFullYear(), since.getMonth(), since.getDate());
    day.getTime() <= until.getTime();
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  ) {
    days.push(day);
  }
  return days;
}

type DayRead = { texts: string[] } | { unreadable: string };

// A missing file is a day with no lines; any other failure names the file.
function readDay(loopDir: string, day: Date): DayRead {
  const file = recordFile(loopDir, day);
  try {
    const texts = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((text) => text.trim() !== '');
    return { texts };
  } catch (e) {
    return isMissing(e)
      ? { texts: [] }
      : { unreadable: `${file}: ${errorText(e)}` };
  }
}

/**
 * Lines with `at` in `[since, until]`, oldest first. A line that is not JSON
 * or fails the schema is skipped and counted. A day file that exists and
 * cannot be read goes in `unreadable`.
 */
export function readRecords(
  loopDir: string,
  since: Date,
  until: Date,
): RecordRead {
  const days = localDays(since, until).map((day) => readDay(loopDir, day));
  const parsed = days.flatMap((day) =>
    'texts' in day ? day.texts.map((text) => parseLine(text)) : [],
  );
  const lines = parsed
    .filter((line): line is RecordLine => line !== undefined)
    .filter((line) => {
      const time = Date.parse(line.at);
      return time >= since.getTime() && time <= until.getTime();
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return {
    lines,
    skipped: parsed.filter((line) => line === undefined).length,
    unreadable: days.flatMap((day) =>
      'unreadable' in day ? [day.unreadable] : [],
    ),
  };
}

/** What makes two requests the same: an absent field equals only an absent field. */
export interface RequestKey {
  class: string | undefined;
  command: string;
  unit: string | undefined;
}

// When the schedule has fewer than two fires in its horizon, look back a year instead.
function windowStart(cron: Cron, at: Date): Date {
  const fallback = new Date(at.getTime() - FALLBACK_WINDOW_DAYS * DAY_MS);
  const latest = previousFire(cron, at);
  if (latest === undefined) return fallback;
  return previousFire(cron, new Date(latest.getTime() - MINUTE_MS)) ?? fallback;
}

/** True when no request with the same class, command, and unit sits between the fire before the latest fire and `at`. */
export function isNewRequest(
  loopDir: string,
  cron: Cron,
  key: RequestKey,
  at: Date,
): boolean {
  const { lines } = readRecords(loopDir, windowStart(cron, at), at);
  return !lines.some(
    (line) =>
      line.kind === 'request' &&
      line.class === key.class &&
      line.command === key.command &&
      line.unit === key.unit,
  );
}
