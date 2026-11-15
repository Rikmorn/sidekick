/**
 * `sidekick loop answer <name> --unit <id> <text>`: a ruling for the worker
 * of the unit's attempt in flight. It appends the text to the attempt's
 * `rulings.md` under a dated heading, the only source of a ruling the worker
 * acts on, then writes `answered`, which closes the attempt's wait. The
 * operator's main runs it, and so may the loop, when its role rules a
 * question itself; each is told the next step that wakes the worker. It
 * reaps first, under the units lock, and refuses when the reap cannot run,
 * so a ruling never extends an attempt the reap judged overdue.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { localMinute } from './local-date.js';
import type { LoopEnv } from './loop.js';
import { RULINGS_FILE } from './loop-dispatch-attempt.js';
import { envIssues } from './loop-dispatch-checks.js';
import { reapFirst } from './loop-reap.js';
import { appendRecord, isControl } from './loop-record.js';
import { sessionOf } from './loop-start-prepare.js';
import {
  attemptInFlight,
  loopNameIssues,
  type UnitContext,
  unitContextOf,
} from './loop-unit-context.js';
import { attemptDir, unitIdIssues } from './loop-units.js';
import { keyHits } from './memory-patterns.js';
import { parseFlags } from './profile.js';

export const ANSWER_USAGE_LINE =
  'sidekick loop answer <name> --unit <id> <text>';

type Out = (line: string) => void;
type Io = { out: Out; err: Out };

const REFUSED = 1;
const ALLOWED_CONTROLS = new Set(['\n', '\t']);
// The rulings file sits in the operator's store, so a link planted there is never followed.
const APPEND_NO_FOLLOW =
  fs.constants.O_WRONLY |
  fs.constants.O_APPEND |
  fs.constants.O_CREAT |
  fs.constants.O_NOFOLLOW;

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return REFUSED;
};

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

// Unicode's notation: at least four hex digits.
const codePointName = (ch: string): string =>
  `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

interface AnswerCall {
  name: string;
  unit: string;
  text: string;
}

function parseAnswer(rest: string[]): AnswerCall | undefined {
  const parsed = parseFlags(rest, { unit: { type: 'string' } });
  if (parsed === undefined || parsed.positionals.length !== 2) return undefined;
  const { unit } = parsed.values;
  if (typeof unit !== 'string') return undefined;
  const [name, text] = parsed.positionals;
  return { name, unit, text };
}

// What refuses the text: none at all, past the cap, a control character
// other than a newline or a tab, each named once, or what looks like a key,
// named by its check and never by the text.
function textIssues(text: string, maxChars: number): string[] {
  if (text.trim() === '') return ['the text is empty: write the ruling in it'];
  const chars = [...text];
  const refused = chars.filter(
    (ch) => isControl(ch) && !ALLOWED_CONTROLS.has(ch),
  );
  const controls = [...new Set(refused.map(codePointName))];
  const ids = keyHits(text);
  return [
    ...(chars.length > maxChars
      ? [
          `the text runs to ${chars.length} characters, past the cap of ${maxChars}: shorten the ruling`,
        ]
      : []),
    ...(controls.length > 0
      ? [
          `the text holds a control character (${controls.join(', ')}): it may hold newlines and tabs, and no other control character`,
        ]
      : []),
    ...(ids.length > 0
      ? [
          `the text holds what looks like a key (${ids.join(', ')}): keep keys out of the rulings file`,
        ]
      : []),
  ];
}

// Appends the ruling under its dated heading, a blank line after any before it.
function appendRuling(file: string, text: string, at: Date): string[] {
  const body = text.endsWith('\n') ? text : `${text}\n`;
  const entry = `## Ruling, ${localMinute(at)}\n\n${body}`;
  try {
    const fd = fs.openSync(file, APPEND_NO_FOLLOW);
    try {
      const lead = fs.fstatSync(fd).size > 0 ? '\n' : '';
      fs.appendFileSync(fd, `${lead}${entry}`);
    } finally {
      fs.closeSync(fd);
    }
    return [];
  } catch (e) {
    return [`cannot write the ruling to ${file}: ${messageOf(e)}`];
  }
}

// The step that wakes the worker: the loop runs `wake` itself, and the
// operator's main, where `SIDEKICK_LOOP` is unset or empty, wakes the loop.
function nextStep(
  lenv: LoopEnv,
  call: AnswerCall,
  worker: string,
  rulings: string,
): string {
  const isLoop = lenv.env.SIDEKICK_LOOP === call.name;
  return isLoop
    ? `next: run sidekick loop wake ${call.name} --unit ${call.unit}, then message ${worker} to read ${rulings}`
    : `next: message ${sessionOf(call.name)} to wake it, so it wakes worker ${worker} and points it at ${rulings}`;
}

// `answered`, once the ruling is in its file, which closes the attempt's wait.
function writeAnswered(
  ctx: UnitContext,
  answer: { unit: string; worker: string; rulings: string },
  at: Date,
): string[] {
  const { unit, worker, rulings } = answer;
  try {
    appendRecord(ctx.loopDir, {
      v: 1,
      at: at.toISOString(),
      kind: 'answered',
      unit,
      worker,
    });
    return [];
  } catch (e) {
    return [
      `the ruling is already in ${rulings}, but answer cannot write the record in ${ctx.loopDir}: ${messageOf(e)}. Running answer again appends the ruling a second time, and the attempt's wait stays open until an answered line closes it`,
    ];
  }
}

// Under the units lock, once the reap has run: the ruling, then `answered`.
function answerInFlight(ctx: UnitContext, call: AnswerCall, io: Io): number {
  const open = attemptInFlight(ctx, call.unit, {
    verb: 'answer',
    lacks: 'has no worker to rule for',
  });
  if ('issues' in open) return refuse(io.err, open.issues);
  const { worker } = open;
  if (worker === '') {
    return refuse(io.err, [
      `the attempt in flight for unit ${call.unit} names no worker, so answer has no rulings file to write`,
    ]);
  }
  const dir = attemptDir(ctx.loopDir, call.unit, worker);
  const rulings = path.join(dir, RULINGS_FILE);
  const at = ctx.lenv.now();
  const appended = appendRuling(rulings, call.text, at);
  if (appended.length > 0) return refuse(io.err, appended);
  const answered = writeAnswered(ctx, { unit: call.unit, worker, rulings }, at);
  if (answered.length > 0) return refuse(io.err, answered);
  io.out(`unit ${call.unit} · worker ${worker} · answered in ${rulings}`);
  io.out(nextStep(ctx.lenv, call, worker, rulings));
  return 0;
}

/**
 * Runs `answer`; returns 0 once the ruling and `answered` are written, else 1.
 * `maxChars` caps the text, so one ruling stays short enough to read whole.
 */
export function loopAnswer(
  rest: string[],
  lenv: LoopEnv,
  out: Out,
  err: Out,
  { maxChars = 20_000 }: { maxChars?: number } = {},
): number {
  const call = parseAnswer(rest);
  if (call === undefined) {
    err(`usage: ${ANSWER_USAGE_LINE}`);
    return REFUSED;
  }
  const early = [
    ...loopNameIssues(call.name),
    ...unitIdIssues(call.unit),
    ...textIssues(call.text, maxChars),
    ...envIssues(lenv.env, call.name, 'answer'),
  ];
  if (early.length > 0) return refuse(err, early);
  const ctx = unitContextOf(call.name, lenv);
  if ('issues' in ctx) return refuse(err, ctx.issues);
  const io = { out, err };
  return reapFirst(ctx, io, () => answerInFlight(ctx, call, io));
}
