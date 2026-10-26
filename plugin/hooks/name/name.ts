// The name mod's adapter: in a main, the first worker launch freezes the
// session's name, so a derived name the operator sees survives `←`. Its rung
// is the operator's 2026-10-22 ruling, beyond ADR-0012's four: it renames its
// own session once, to the name it already shows. The rename draws its line in
// the transcript and tells the model the session was named. No hook adds
// context, approves, or denies. The role, the publisher, the board, the desk,
// and the scope mod share `session.start` under the same matcher, and the
// gauge shares it unmatched. The board shares `classic.PostToolUse` on Bash.
// A hook that fails in one mod skips the module's whole hook for that event,
// so each hook here keeps its own failures, which go to the debug log, and
// calls `next(e)` once.

import type { EngineInterface, On, ProcessRunResult } from 'claude-code';
import { type Role, settleRole } from '../role';
import {
  parseSessionAnswer,
  RUN_TIMEOUT_MS,
  type SessionAnswer,
} from './contract';
import { isLaunch, renameCommand, verdictOf } from './logic';

/** How long after a check its rename waits: the timer takes `$.command.run` out of the hook, which may not call it, and the call then queues until the session is idle. */
export const RENAME_DELAY_MS = 500;

const MS_PER_SECOND = 1_000;

// A call that rejected gives its reason instead of its value.
type Settled<T> = { value: T } | { reason: string };

// One check: the command's answer, or why there is none.
type Checked = { answer: SessionAnswer } | { failure: string };

// What the name mod keeps between its hooks. The engine follows `$` only into
// functions declared at the top of the file, so the functions that take it
// are declared here and handed this state.
interface NameState {
  // Settled at the start; undefined until the start hook runs.
  role: Role | undefined;
  // True while a check runs, so a launch meanwhile starts no second one.
  isChecking: boolean;
  // True once a rename is scheduled or the name holds: no later launch checks.
  isDone: boolean;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logLine($: EngineInterface, text: string): void {
  $.ui.log(`sidekick name: ${text}`, { to: 'debug' });
}

function firstLine(text: string): string | undefined {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');
}

async function settle<T>(call: Promise<T>): Promise<Settled<T>> {
  try {
    return { value: await call };
  } catch (error) {
    return { reason: reasonOf(error) };
  }
}

// The `tool_input.command` of a Bash call, when it holds a string.
function commandOf(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || !('command' in input)) {
    return undefined;
  }
  const { command } = input;
  return typeof command === 'string' ? command : undefined;
}

// A run rejects when it cannot start, a plugin refuses it, or it outlasts its
// timeout. The declarations give no way to tell which, so the line names both.
function checkedOf(ran: Settled<ProcessRunResult>): Checked {
  if ('reason' in ran) {
    const seconds = RUN_TIMEOUT_MS / MS_PER_SECOND;
    return {
      failure: `the session command did not start, or did not finish within ${seconds} s: ${ran.reason}`,
    };
  }
  const { exitCode, stdout, stderr } = ran.value;
  if (exitCode !== 0) {
    const exited = `the session command exited ${exitCode}`;
    const detail = firstLine(stderr);
    return { failure: detail === undefined ? exited : `${exited}: ${detail}` };
  }
  const answer = parseSessionAnswer(stdout);
  return answer === undefined
    ? { failure: 'the session command printed no answer' }
    : { answer };
}

// The session id is read at each check: /clear starts a new one with no
// `session.start` after it.
async function checkSession($: EngineInterface): Promise<Checked> {
  const self = await settle($.session.id());
  if ('reason' in self) {
    return { failure: `reading the session id failed: ${self.reason}` };
  }
  const cli = `${$.plugin.root}/bin/sidekick`;
  const argv = [cli, 'session', '--json', '--self', self.value];
  return checkedOf(
    await settle($.process.run(argv, { timeoutMs: RUN_TIMEOUT_MS })),
  );
}

async function rename($: EngineInterface, name: string): Promise<void> {
  try {
    await $.command.run(renameCommand(name));
  } catch (error) {
    logLine($, `the rename failed: ${reasonOf(error)}`);
  }
}

// The hook awaits this, so the timer is set inside the hook: the form known to
// rename once the session is idle. A failed or unsure check leaves the next launch to check.
async function checkAfterLaunch(
  $: EngineInterface,
  state: NameState,
): Promise<void> {
  state.isChecking = true;
  try {
    const checked = await checkSession($);
    if ('failure' in checked) {
      logLine($, checked.failure);
      return;
    }
    const verdict = verdictOf(checked.answer);
    switch (verdict.kind) {
      case 'freeze':
        $.clock.after(RENAME_DELAY_MS, () => void rename($, verdict.name));
        state.isDone = true;
        logLine($, `freezing "${verdict.name}" once this session is idle`);
        return;
      case 'held':
        state.isDone = true;
        logLine($, "the session's name holds: nothing to freeze");
        return;
      case 'unsure':
        logLine($, `nothing frozen: ${verdict.reason}`);
        return;
      default: {
        const unhandled: never = verdict;
        throw new Error(`Unhandled verdict: ${JSON.stringify(unhandled)}`);
      }
    }
  } finally {
    state.isChecking = false;
  }
}

/**
 * Hooks the name mod: settles the role at each interactive start, and in a
 * main checks the session's name after a Bash call that launches a worker.
 * It freezes a name that does not hold, at most once per load.
 */
export function registerName(on: On): void {
  const state: NameState = {
    role: undefined,
    isChecking: false,
    isDone: false,
  };

  // The engine refuses a second `session.start` hook without a matcher, and
  // the gauge has one.
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    try {
      state.role = await settleRole($);
    } catch (error) {
      logLine($, `session.start failed: ${reasonOf(error)}`);
    }
    return next(e);
  });

  // The hook checks whatever the call's outcome; the board's identical matcher loads beside it.
  on('classic.PostToolUse', { tool_name: 'Bash' }, async ($, e, next) => {
    const result = await next(e);
    try {
      const command = commandOf(e.tool_input);
      const isMain = state.role?.kind === 'main';
      const isFree = !state.isChecking && !state.isDone;
      const isLaunchCall = command !== undefined && isLaunch(command);
      if (isMain && isFree && isLaunchCall) await checkAfterLaunch($, state);
    } catch (error) {
      logLine($, `classic.PostToolUse failed: ${reasonOf(error)}`);
    }
    return result;
  });
}
