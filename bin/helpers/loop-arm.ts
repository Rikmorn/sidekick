/**
 * `sidekick loop arm`: what a running loop calls on itself to learn which cron jobs to make, and to report them.
 * Only the model can make a cron job, so the plain form prints and `--armed` records.
 */

import * as path from 'node:path';
import { localMinute } from './local-date.js';
import type { LoopEnv } from './loop.js';
import {
  type Armed,
  currentArmed,
  type LoopState,
  readArmed,
  readState,
  STATE_FILE,
  writeArmed,
} from './loop-state.js';
import { loopsRoot } from './loop-store.js';
import { parseFlags } from './profile.js';
import { isProfileName, PROFILE_NAME_RULE } from './profile-manifest.js';

/** The loop's environment variable that replaces the renewal's six days with a count of minutes. */
export const RENEWAL_VARIABLE = 'SIDEKICK_LOOP_RENEWAL_MINUTES';

/** The prompt a renewal runs, which starts the skill that remakes both jobs. */
export const armPrompt = (name: string): string => `/sidekick:loop-arm ${name}`;

export const ARM_USAGE_LINE =
  'sidekick loop arm <name> [--armed --tick <id> --renewal <id>]';

const MINUTE_MS = 60_000;
const SIX_DAYS_MINUTES = 6 * 24 * 60;
const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;
const WHOLE_NUMBER = /^[1-9]\d*$/;

/** `now` plus six days, or plus `minutes`, rounded up to the next whole minute. */
export function renewalTime(
  now: Date,
  minutes: number = SIX_DAYS_MINUTES,
): Date {
  const target = now.getTime() + minutes * MINUTE_MS;
  return new Date(Math.ceil(target / MINUTE_MS) * MINUTE_MS);
}

/** The one-shot cron for `at`: minute, hour, day, month in local time, any weekday. */
export const renewalCron = (at: Date): string =>
  `${at.getMinutes()} ${at.getHours()} ${at.getDate()} ${at.getMonth() + 1} *`;

type Out = (line: string) => void;

const usage = (err: Out): number => {
  err(`usage: ${ARM_USAGE_LINE}`);
  return 1;
};

const refuse = (err: Out, issue: string): number => {
  err(issue);
  return 1;
};

type Minutes =
  | { ok: true; minutes: number | undefined }
  | { ok: false; issue: string };

// The seam's value: unset keeps six days; anything but a positive whole number refuses, naming the variable.
function minutesOf(text: string | undefined, now: Date): Minutes {
  if (text === undefined) return { ok: true, minutes: undefined };
  const minutes = Number(text);
  const valid =
    WHOLE_NUMBER.test(text) &&
    Number.isSafeInteger(minutes) &&
    !Number.isNaN(renewalTime(now, minutes).getTime());
  return valid
    ? { ok: true, minutes }
    : {
        ok: false,
        issue: `${RENEWAL_VARIABLE}="${text}": must be a positive whole number of minutes`,
      };
}

type Loaded =
  | { ok: true; dir: string; state: LoopState; renewalAt: Date }
  | { ok: false; issue: string };

// The loop's folder and its state, after the name, the running loop's own name, and the seam are checked.
function load(name: string, lenv: LoopEnv): Loaded {
  if (!isProfileName(name)) {
    return {
      ok: false,
      issue: `"${name}" is not a loop name: use ${PROFILE_NAME_RULE}`,
    };
  }
  const running = lenv.env.SIDEKICK_LOOP;
  if (running !== undefined && running !== '' && running !== name) {
    return {
      ok: false,
      issue: `SIDEKICK_LOOP is "${running}", so this session cannot arm "${name}"`,
    };
  }
  const minutes = minutesOf(lenv.env[RENEWAL_VARIABLE], lenv.now());
  if (!minutes.ok) return minutes;
  const dir = path.join(loopsRoot(lenv.env, lenv.cwd, lenv.home), name);
  const read = readState(dir);
  if (read.kind === 'broken') return { ok: false, issue: read.issue };
  if (read.kind === 'absent') {
    return {
      ok: false,
      issue: `${path.join(dir, STATE_FILE)} does not exist: sidekick loop start writes it, so arm runs only in a loop that start launched`,
    };
  }
  return {
    ok: true,
    dir,
    state: read.value,
    renewalAt: renewalTime(lenv.now(), minutes.minutes),
  };
}

function plain(
  name: string,
  loaded: Extract<Loaded, { ok: true }>,
  out: Out,
): number {
  const { state, renewalAt, dir } = loaded;
  const armed = currentArmed(state, readArmed(dir));
  const lines = [
    `loop: ${name}`,
    `launch: ${state.launch}`,
    'tick job: recurring',
    `tick schedule: ${state.schedule}`,
    `tick prompt: ${state.tick}`,
    'renewal job: one-shot',
    `renewal cron: ${renewalCron(renewalAt)}`,
    `renewal at: ${localMinute(renewalAt)}`,
    `renewal prompt: ${armPrompt(name)}`,
    armed === undefined
      ? 'old jobs: none recorded'
      : `old tick job id: ${armed.tick}`,
    ...(armed === undefined ? [] : [`old renewal job id: ${armed.renewal}`]),
    `after both jobs exist, run: sidekick loop arm ${name} --armed --tick <tick job id> --renewal <renewal job id>`,
  ];
  for (const line of lines) out(line);
  return 0;
}

function armed(
  name: string,
  loaded: Extract<Loaded, { ok: true }>,
  ids: { tick: string; renewal: string },
  lenv: LoopEnv,
  out: Out,
  err: Out,
): number {
  const bad = (['tick', 'renewal'] as const).find(
    (flag) => !JOB_ID.test(ids[flag]),
  );
  if (bad !== undefined) {
    return refuse(
      err,
      `--${bad} "${ids[bad]}": a job id is 1 to 64 letters, digits, "-", or "_"`,
    );
  }
  const record: Armed = {
    v: 1,
    launch: loaded.state.launch,
    at: lenv.now().toISOString(),
    tick: ids.tick,
    renewal: ids.renewal,
    renewalAt: loaded.renewalAt.toISOString(),
  };
  const issues = writeArmed(loaded.dir, record);
  if (issues.length > 0) {
    for (const issue of issues) err(issue);
    return 1;
  }
  out(`armed ${name}: tick ${ids.tick}, renewal ${ids.renewal}`);
  out(`renewal at: ${localMinute(loaded.renewalAt)}`);
  return 0;
}

/** `sidekick loop arm <name> [--armed --tick <id> --renewal <id>]`; returns the exit code. */
export function runArm(
  rest: string[],
  lenv: LoopEnv,
  out: Out,
  err: Out,
): number {
  const parsed = parseFlags(rest, {
    armed: { type: 'boolean' },
    tick: { type: 'string' },
    renewal: { type: 'string' },
  });
  if (parsed === undefined || parsed.positionals.length !== 1) {
    return usage(err);
  }
  const [name] = parsed.positionals;
  const { armed: isArmed, tick, renewal } = parsed.values;
  const ids = {
    tick: typeof tick === 'string' ? tick : undefined,
    renewal: typeof renewal === 'string' ? renewal : undefined,
  };
  if (isArmed !== true) {
    if (ids.tick !== undefined || ids.renewal !== undefined) return usage(err);
  } else if (ids.tick === undefined || ids.renewal === undefined) {
    return usage(err);
  }
  const loaded = load(name, lenv);
  if (!loaded.ok) return refuse(err, loaded.issue);
  if (isArmed !== true) return plain(name, loaded, out);
  if (ids.tick === undefined || ids.renewal === undefined) return usage(err);
  return armed(
    name,
    loaded,
    { tick: ids.tick, renewal: ids.renewal },
    lenv,
    out,
    err,
  );
}
