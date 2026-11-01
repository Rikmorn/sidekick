/**
 * The arguments of `sidekick worker finish`, and the commands that repeat or
 * replace a run. It parses the flags into a subject and a mode, and builds the
 * re-run and discard commands that a refusal offers.
 */

import * as path from 'node:path';
import * as v from 'valibot';
import { parseFlags } from './profile.js';
import { shellArg } from './shell.js';
import { WorkerNameSchema } from './worker-brief.js';

/** Which landing `finish` checks for: a target, or none on the operator's word. */
export type FinishMode =
  | { kind: 'landed'; into: string | undefined }
  | { kind: 'discard' };

/** The worker to clear: the one a brief names, or a name in place of a brief that is gone. */
export type FinishSubject =
  | { kind: 'brief'; brief: string }
  | { kind: 'name'; name: string };

/** What `finish` was asked for, its paths absolute. */
export interface FinishOptions {
  subject: FinishSubject;
  noReport: boolean;
  mode: FinishMode;
  /** The operator's `--worktree`, the finder's only candidate when given. */
  worktree: string | undefined;
}

/**
 * A parse: the options, or the lines that say what `--name` needs. Undefined
 * is a usage error, which the usage line answers.
 */
export type FinishArgs = FinishOptions | { usageErrors: string[] } | undefined;

type Shared = Omit<FinishOptions, 'subject'>;

const NEEDS_REPORT =
  '--name needs --no-report or --discard, since there is no brief to say where the run report goes';
const NEEDS_INTO =
  '--name needs --into <rev> or --discard, since there is no brief to name the target';

const stringFlag = (
  values: Record<string, string | boolean | undefined>,
  key: string,
): string | undefined => {
  const value = values[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Parses `finish`'s arguments, resolving the brief and `--worktree` against
 * `cwd`, the folder the command was typed in.
 */
export function parseFinishArgs(rest: string[], cwd: string): FinishArgs {
  const parsed = parseFlags(rest, {
    'no-report': { type: 'boolean' },
    into: { type: 'string' },
    discard: { type: 'boolean' },
    name: { type: 'string' },
    worktree: { type: 'string' },
  });
  if (parsed === undefined) return undefined;
  const { values, positionals } = parsed;
  const into = stringFlag(values, 'into');
  const worktree = stringFlag(values, 'worktree');
  const discard = values.discard === true;
  // path.resolve would read an empty value as the current folder.
  if ((discard && into !== undefined) || worktree === '') return undefined;
  const shared: Shared = {
    noReport: values['no-report'] === true,
    mode: discard ? { kind: 'discard' } : { kind: 'landed', into },
    worktree: worktree === undefined ? undefined : path.resolve(cwd, worktree),
  };
  const name = stringFlag(values, 'name');
  if (name !== undefined) {
    return positionals.length === 0 ? byName(name, shared) : undefined;
  }
  if (positionals.length !== 1) return undefined;
  const brief = path.resolve(cwd, positionals[0]);
  return { subject: { kind: 'brief', brief }, ...shared };
}

// --name reads no brief, so the flags must say what becomes of the report and
// where the work landed. The name passes the brief's rule, since it names the
// record's file and the backup ref.
function byName(name: string, shared: Shared): FinishArgs {
  const valid = v.safeParse(WorkerNameSchema, name);
  if (!valid.success) {
    return {
      usageErrors: [
        `--name "${name}" is not a worker's name: it ${valid.issues[0].message}`,
      ],
    };
  }
  const { noReport, mode } = shared;
  const reportSettled = noReport || mode.kind === 'discard';
  const targetSettled = mode.kind === 'discard' || mode.into !== undefined;
  const usageErrors = [
    ...(reportSettled ? [] : [NEEDS_REPORT]),
    ...(targetSettled ? [] : [NEEDS_INTO]),
  ];
  if (usageErrors.length > 0) return { usageErrors };
  return { subject: { kind: 'name', name }, ...shared };
}

// The arguments that name the worker: its brief, or `--name`.
function subjectArgs(subject: FinishSubject): string[] {
  switch (subject.kind) {
    case 'brief':
      return [shellArg(subject.brief)];
    case 'name':
      return ['--name', shellArg(subject.name)];
    default: {
      const unhandled: never = subject;
      throw new Error(`unhandled subject: ${JSON.stringify(unhandled)}`);
    }
  }
}

// The flags that repeat a mode: `--into` with its rev as typed, or `--discard`.
function modeFlags(mode: FinishMode): string[] {
  switch (mode.kind) {
    case 'landed':
      return mode.into === undefined ? [] : ['--into', shellArg(mode.into)];
    case 'discard':
      return ['--discard'];
    default: {
      const unhandled: never = mode;
      throw new Error(`unhandled mode: ${JSON.stringify(unhandled)}`);
    }
  }
}

// The command that runs `finish` on this worker in `mode`, its flags in the usage's order.
function commandFor(opts: FinishOptions, mode: FinishMode): string {
  const report = opts.noReport ? ['--no-report'] : [];
  const worktree =
    opts.worktree === undefined ? [] : ['--worktree', shellArg(opts.worktree)];
  return [
    'sidekick worker finish',
    ...subjectArgs(opts.subject),
    ...report,
    ...modeFlags(mode),
    ...worktree,
  ].join(' ');
}

// The command that repeats this run.
export const rerunCommand = (opts: FinishOptions): string =>
  commandFor(opts, opts.mode);

// The command that discards instead; it keeps --no-report, or it would refuse for the missing report.
export const discardCommandFor = (opts: FinishOptions): string =>
  commandFor(opts, { kind: 'discard' });
