// The desk's pure logic: no engine calls, so the tests reach it directly.

import { fit, hiddenRows, scrollHint, scrollKeys, width } from '../lines';
import type { PublishedSession } from '../publish/contract';
import { fitRow, rowWidth, type StyledRow, type StyledRun } from '../styled';
import type { DeskSnapshot } from './contract';
import { needYouText, type PaneEntry } from './look';
import { treeEntries } from './rows';
import { deskTree } from './tree';

export type Tone = 'waiting' | 'working' | 'muted' | 'failure';

export interface Line {
  tone: Tone;
  text: string;
}

type OkSnapshot = Extract<DeskSnapshot, { ok: true }>;

// An entry carries the separator that precedes it, so the finished count can join differently.
interface Entry {
  before: string;
  text: string;
}

const WAITING_PREFIX = '● needs you';
const WORKERS_PREFIX = '◐ workers';
const AFTER_PREFIX = '  ';
// Both prefixes pad to the longer one, so entries start in one column.
const PREFIX_WIDTH = Math.max(width(WAITING_PREFIX), width(WORKERS_PREFIX));
const WAITING_JOIN = '   ';
const WORKERS_JOIN = ' · ';
const FINISHED_JOIN = '   ';
const DETAIL_JOIN = ' · ';

function moreSuffix(left: number): string {
  return ` +${left} more`;
}

function padded(prefix: string): string {
  return prefix + ' '.repeat(PREFIX_WIDTH - width(prefix)) + AFTER_PREFIX;
}

function joined(entries: Entry[]): string {
  return entries
    .map((entry, index) => (index === 0 ? '' : entry.before) + entry.text)
    .join('');
}

// Whole entries first, then "+N more", then that text cut, ending in an ellipsis.
function fitLine(prefix: string, entries: Entry[], columns: number): string {
  const head = padded(prefix);
  const all = head + joined(entries);
  if (width(all) <= columns) return all;
  for (let kept = entries.length - 1; kept >= 1; kept -= 1) {
    const candidate =
      head + joined(entries.slice(0, kept)) + moreSuffix(entries.length - kept);
    if (width(candidate) <= columns) return candidate;
  }
  return fit(`${head}+${entries.length} more`, columns);
}

function failureLine(message: string, columns: number): Line {
  return { tone: 'failure', text: fit(`⚠ desk: ${message}`, columns) };
}

function warningLines(snapshot: OkSnapshot, columns: number): Line[] {
  const [first] = snapshot.warnings;
  return first === undefined ? [] : [failureLine(first, columns)];
}

function waitingEntries(snapshot: OkSnapshot): Entry[] {
  return snapshot.waiting.map((session) => ({
    before: WAITING_JOIN,
    text: `${session.name}${DETAIL_JOIN}${session.reason}`,
  }));
}

function workerEntries(snapshot: OkSnapshot): Entry[] {
  const children = snapshot.children.map((child) => ({
    before: WORKERS_JOIN,
    text: `${child.name} ${child.state}`,
  }));
  const finished =
    snapshot.finished > 0
      ? [{ before: FINISHED_JOIN, text: `${snapshot.finished} finished` }]
      : [];
  return [...children, ...finished];
}

function workersLines(snapshot: OkSnapshot, columns: number): Line[] {
  if (snapshot.children.length > 0) {
    return [
      {
        tone: 'working',
        text: fitLine(WORKERS_PREFIX, workerEntries(snapshot), columns),
      },
    ];
  }
  if (snapshot.finished > 0) {
    return [
      { tone: 'muted', text: fit(`${snapshot.finished} finished`, columns) },
    ];
  }
  return [];
}

/** The band's lines, each cut to `columns` with "+N more"; empty when nothing waits, finished, or is a child and the snapshot is ok. */
export function bandLines(snapshot: DeskSnapshot, columns: number): Line[] {
  if (columns < 1) return [];
  if (!snapshot.ok) return [failureLine(snapshot.error, columns)];
  const waiting: Line[] =
    snapshot.waiting.length > 0
      ? [
          {
            tone: 'waiting',
            text: fitLine(WAITING_PREFIX, waitingEntries(snapshot), columns),
          },
        ]
      : [];
  return [
    ...waiting,
    ...workersLines(snapshot, columns),
    ...warningLines(snapshot, columns),
  ];
}

/** A failed run's one row in the pane, in the error tone, within `columns` and ending in an ellipsis when cut. */
export function failureRow(message: string, columns: number): StyledRow {
  return [{ text: failureLine(message, columns).text, tone: 'error' }];
}

/** The pane's rows: the tree at `columns`, then each warning, the listing's and job state's, in a failure row. Empty below one column. */
export function paneEntries(
  snapshot: OkSnapshot,
  keys: ReadonlyMap<string, PublishedSession>,
  columns: number,
  now: number,
): PaneEntry[] {
  if (columns < 1) return [];
  const warnings = [...snapshot.warnings, ...snapshot.paneWarnings].map(
    (warning): PaneEntry => ({
      row: failureRow(warning, columns),
      needsYou: false,
    }),
  );
  return [...treeEntries(deskTree(snapshot, keys, now), columns), ...warnings];
}

/** The pane's rows as drawn, each cut to `columns`. */
export function paneRows(
  snapshot: OkSnapshot,
  keys: ReadonlyMap<string, PublishedSession>,
  columns: number,
  now: number,
): StyledRow[] {
  return paneEntries(snapshot, keys, columns, now).map(({ row }) => row);
}

/** How many sessions that need the operator head a row the pane's window hides, once its first row holds the hint. */
export function hiddenNeeds(
  entries: readonly PaneEntry[],
  bodyRows: number,
): number {
  if (hiddenRows(entries.length, bodyRows) === 0) return 0;
  return entries
    .slice(Math.max(0, bodyRows - 1))
    .filter((entry) => entry.needsYou).length;
}

/**
 * The pane's first row while its rows exceed its body. With no needs-you row
 * hidden it is the shared scroll hint; else `+N rows · M need you`, then the
 * keys when they fit. Undefined when the rows fit.
 */
export function paneHint(
  entries: readonly PaneEntry[],
  bodyRows: number,
  isFocused: boolean,
  columns: number,
): StyledRow | undefined {
  const shared = scrollHint(entries.length, bodyRows, isFocused);
  if (shared === undefined) return undefined;
  const needs = hiddenNeeds(entries, bodyRows);
  if (needs === 0) return [{ text: fit(shared, columns), tone: 'inactive' }];
  const named: StyledRun[] = [
    {
      text: `+${hiddenRows(entries.length, bodyRows)} rows · `,
      tone: 'inactive',
    },
    { text: needYouText(needs), tone: 'warning' },
  ];
  const keys: StyledRun = {
    text: ` · ${scrollKeys(isFocused)}`,
    tone: 'inactive',
  };
  const full = [...named, keys];
  return fitRow(rowWidth(full) <= columns ? full : named, columns);
}

/** Whether two snapshots draw the same. */
export function sameSnapshot(a: DeskSnapshot, b: DeskSnapshot): boolean {
  // `parseDeskSnapshot` rebuilds each object with literal keys in a fixed order, so the serialised forms compare by value.
  return JSON.stringify(a) === JSON.stringify(b);
}

export function hasChildren(snapshot: DeskSnapshot): boolean {
  return snapshot.ok && snapshot.children.length > 0;
}
