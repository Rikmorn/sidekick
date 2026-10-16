// The desk's pure logic: no engine calls, so the tests reach it directly.

import { cut, width } from '../lines';
import type { DeskChild, DeskSnapshot } from './contract';

export type Tone =
  | 'waiting'
  | 'working'
  | 'done'
  | 'mark'
  | 'muted'
  | 'heading'
  | 'failure';

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
const WORKERS_PREFIX = '◆ workers';
const AFTER_PREFIX = '  ';
// Both prefixes pad to the longer one, so entries start in one column.
const PREFIX_WIDTH = Math.max(width(WAITING_PREFIX), width(WORKERS_PREFIX));
const WAITING_JOIN = '   ';
const WORKERS_JOIN = ' · ';
const FINISHED_JOIN = '   ';
const DETAIL_JOIN = ' · ';

// Anything not listed reads muted, "gone" and unknown states included.
const CHILD_STATE_TONES: Record<string, Tone> = {
  working: 'working',
  done: 'done',
};

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

// Whole entries first, then "+N more", then the bare cut text.
function fitLine(prefix: string, entries: Entry[], columns: number): string {
  const head = padded(prefix);
  const all = head + joined(entries);
  if (width(all) <= columns) return all;
  for (let kept = entries.length - 1; kept >= 1; kept -= 1) {
    const candidate =
      head + joined(entries.slice(0, kept)) + moreSuffix(entries.length - kept);
    if (width(candidate) <= columns) return candidate;
  }
  return cut(`${head}+${entries.length} more`, columns);
}

function failureLine(message: string, columns: number): Line {
  return { tone: 'failure', text: cut(`⚠ desk: ${message}`, columns) };
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
      { tone: 'muted', text: cut(`${snapshot.finished} finished`, columns) },
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

function tokensText(tokens: number): string {
  const thousand = 1000;
  return tokens < thousand
    ? `${tokens} tokens`
    : `${Math.round(tokens / thousand)}k tokens`;
}

function withReason(head: string, reason: string | undefined): string {
  return reason === undefined || reason === ''
    ? head
    : `${head}${DETAIL_JOIN}${reason}`;
}

function childLines(child: DeskChild, waits: boolean): Line[] {
  const nameTone: Tone = waits
    ? 'waiting'
    : (CHILD_STATE_TONES[child.state] ?? 'muted');
  const stats = [
    ...(child.tokens === undefined ? [] : [tokensText(child.tokens)]),
    ...(child.plan === undefined ? [] : [child.plan]),
  ];
  const lines: Line[] = [
    {
      tone: nameTone,
      text: withReason(`${child.name} ${child.state}`, child.reason),
    },
  ];
  if (stats.length > 0)
    lines.push({ tone: 'muted', text: stats.join(DETAIL_JOIN) });
  if (child.lastCommit !== undefined)
    lines.push({ tone: 'muted', text: child.lastCommit });
  if (child.unintegrated > 0) {
    lines.push({
      tone: 'mark',
      text: `${child.unintegrated} commits not integrated`,
    });
  }
  if (child.uncommitted)
    lines.push({ tone: 'mark', text: 'uncommitted changes' });
  return lines;
}

function childrenBlock(snapshot: OkSnapshot): Line[] {
  if (snapshot.children.length === 0) return [];
  const title =
    snapshot.repo === undefined
      ? 'CHILDREN'
      : `CHILDREN${DETAIL_JOIN}${snapshot.repo}`;
  const waitingChildren = new Set(
    snapshot.waiting
      .filter((session) => session.child)
      .map((session) => session.name),
  );
  return [
    { tone: 'heading', text: title },
    ...snapshot.children.flatMap((child) =>
      childLines(child, waitingChildren.has(child.name)),
    ),
  ];
}

function othersBlock(snapshot: OkSnapshot): Line[] {
  const waitingOthers = new Set(
    snapshot.waiting
      .filter((session) => !session.child)
      .map((session) => session.name),
  );
  const rows: Line[] = snapshot.others.map((other) => ({
    tone: waitingOthers.has(other.name) ? 'waiting' : 'muted',
    text: withReason(
      [other.name, other.repo, other.state].join(DETAIL_JOIN),
      other.reason,
    ),
  }));
  return [
    { tone: 'heading', text: 'OTHER SESSIONS' },
    ...(rows.length > 0 ? rows : [{ tone: 'muted' as const, text: 'none' }]),
  ];
}

/** The pane's rows, each cut to `columns`. */
export function paneLines(snapshot: DeskSnapshot, columns: number): Line[] {
  if (columns < 1) return [];
  if (!snapshot.ok) return [failureLine(snapshot.error, columns)];
  return [
    ...childrenBlock(snapshot),
    ...othersBlock(snapshot),
    ...warningLines(snapshot, columns),
  ]
    .map((line) => ({ ...line, text: cut(line.text, columns) }))
    .filter((line) => line.text !== '');
}

/** Whether two snapshots draw the same. */
export function sameSnapshot(a: DeskSnapshot, b: DeskSnapshot): boolean {
  // `parseDeskSnapshot` rebuilds each object with literal keys in a fixed order, so the serialised forms compare by value.
  return JSON.stringify(a) === JSON.stringify(b);
}

export function hasChildren(snapshot: DeskSnapshot): boolean {
  return snapshot.ok && snapshot.children.length > 0;
}
