/**
 * The arguments of `sidekick worker finish`, and the commands that repeat or
 * replace a run. It parses the flags into a mode, and builds the re-run and
 * discard commands that a refusal offers.
 */

import * as path from 'node:path';
import { parseFlags } from './profile.js';
import { shellArg } from './shell.js';

/** Which landing `finish` checks for: a target, or none on the operator's word. */
export type FinishMode =
  | { kind: 'landed'; into: string | undefined }
  | { kind: 'discard' };

/** What `finish` was asked for, the brief's path absolute. */
export interface FinishOptions {
  brief: string;
  noReport: boolean;
  mode: FinishMode;
}

/**
 * Parses `finish`'s arguments, resolving the brief against `cwd`, the folder
 * the command was typed in. Undefined is a usage error.
 */
export function parseFinishArgs(
  rest: string[],
  cwd: string,
): FinishOptions | undefined {
  const parsed = parseFlags(rest, {
    'no-report': { type: 'boolean' },
    into: { type: 'string' },
    discard: { type: 'boolean' },
  });
  if (parsed === undefined || parsed.positionals.length !== 1) return undefined;
  const { into, discard } = parsed.values;
  if (discard === true && into !== undefined) return undefined;
  return {
    brief: path.resolve(cwd, parsed.positionals[0]),
    noReport: parsed.values['no-report'] === true,
    mode:
      discard === true
        ? { kind: 'discard' }
        : { kind: 'landed', into: typeof into === 'string' ? into : undefined },
  };
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

// The command that runs `finish` on this brief in `mode`, its flags in the usage's order.
function commandFor(opts: FinishOptions, mode: FinishMode): string {
  const report = opts.noReport ? ['--no-report'] : [];
  return [
    'sidekick worker finish',
    shellArg(opts.brief),
    ...report,
    ...modeFlags(mode),
  ].join(' ');
}

// The command that repeats this run.
export const rerunCommand = (opts: FinishOptions): string =>
  commandFor(opts, opts.mode);

// The command that discards instead; it keeps --no-report, or it would refuse for the missing report.
export const discardCommandFor = (opts: FinishOptions): string =>
  commandFor(opts, { kind: 'discard' });
