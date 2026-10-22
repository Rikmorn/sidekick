// When the name mod acts, as pure logic: the Bash commands that launch a
// worker, what one answer of the session command leads to, and the rename.

import type { CommandRunArgs } from 'claude-code';
import type { SessionAnswer } from './contract';

/** What one answer leads to: freeze its name, stop checking since the name holds, or check again at the next launch. */
export type Verdict =
  | { kind: 'freeze'; name: string }
  | { kind: 'held' }
  | { kind: 'unsure'; reason: string };

// The second copy: `board/logic.ts` keeps the first, private to the board.
const COMMAND_SEPARATORS = /&&|\|\||[;|\n]/;

// One shell word: quoted stretches and bare characters, run together.
const SHELL_WORD = /(?:"[^"]*"|'[^']*'|[^\s"'])+/g;
const QUOTES = /["']/g;

// The executable by any path: `sidekick` alone, or a path whose last part it is.
const EXECUTABLE = /(?:^|\/)sidekick$/;

// The options end at `--`; the words after it are the prompt.
const END_OF_OPTIONS = '--';
const BACKGROUND = '--bg';

function wordsOf(part: string): string[] {
  return (part.match(SHELL_WORD) ?? []).map((word) => word.replace(QUOTES, ''));
}

function isBackground(args: readonly string[]): boolean {
  const end = args.indexOf(END_OF_OPTIONS);
  const options = end === -1 ? args : args.slice(0, end);
  return options.includes(BACKGROUND);
}

// A launch is the executable at the part's start, then its verb.
function isLaunchPart(part: string): boolean {
  const [executable, noun, verb, ...args] = wordsOf(part);
  if (executable === undefined || !EXECUTABLE.test(executable)) return false;
  if (noun === 'worker') return verb === 'dispatch';
  return noun === 'profile' && verb === 'launch' && isBackground(args);
}

/** Whether a Bash command launches a worker: `sidekick worker dispatch`, or `sidekick profile launch` with `--bg`, by any path to the executable. */
export function isLaunch(command: string): boolean {
  return command.split(COMMAND_SEPARATORS).some(isLaunchPart);
}

/** `/rename <name>` as `$.command.run` takes it: the whole name is one argument. */
export function renameCommand(name: string): CommandRunArgs {
  return { command: 'rename', args: name };
}

/** The verdict on one answer: a listed name freezes only while `held` is false. */
export function verdictOf(answer: SessionAnswer): Verdict {
  if (answer.held === true) return { kind: 'held' };
  if (answer.held === null) {
    return { kind: 'unsure', reason: 'whether the name holds is unknown' };
  }
  if (answer.name === null) {
    return { kind: 'unsure', reason: 'the listing gives the session no name' };
  }
  return { kind: 'freeze', name: answer.name };
}
