/**
 * `sidekick loop list|show|record`: the verbs over the loop store. Usage errors
 * and refusals return 1, as the `profile` family's do.
 */

import * as path from 'node:path';
import * as v from 'valibot';
import { localDate, localMinute } from './local-date.js';
import { checkLoop, type LoopCheck, type LoopDeps } from './loop-check.js';
import { type Cron, parseCron } from './loop-cron.js';
import { inheritedListing } from './loop-inherited.js';
import {
  LOOP_FILE,
  type LoopManifest,
  readLoopManifest,
} from './loop-manifest.js';
import {
  appendRecord,
  isNewRequest,
  MODEL_KINDS,
  type ModelKind,
  type RecordLine,
  RecordLineSchema,
  readRecords,
} from './loop-record.js';
import { loopNames, loopsRoot } from './loop-store.js';
import { keyHits } from './memory-patterns.js';
import { type FlagOption, type ProfileEnv, parseFlags } from './profile.js';
import { isProfileName, PROFILE_NAME_RULE } from './profile-manifest.js';
import { configDir } from './sidekick-home.js';

export const LOOP_USAGE_LINE =
  'sidekick loop list | show <name> [--since <YYYY-MM-DD>] | record <name> --kind <would|request|did|denied|note> --summary <text> [--class <class>] [--command <text>] [--unit <id>]';

/** The profile family's environment, with a clock and the managed settings path the check and the listing read. */
export interface LoopEnv extends ProfileEnv {
  /** The time `record` stamps a line with, and the end of `show`'s window. */
  now: () => Date;
  /** The managed settings file; unset, the check and the listing read Claude Code's own path. */
  managedFile?: string;
}

type Out = (line: string) => void;
type Verb = (rest: string[], lenv: LoopEnv, out: Out, err: Out) => number;

const DAY_MS = 24 * 60 * 60 * 1000;
const NONE = '  (none)';
const MODEL_KIND_LIST = 'would, request, did, denied, and note';

const usage = (err: Out): number => {
  err(`usage: ${LOOP_USAGE_LINE}`);
  return 1;
};

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return 1;
};

// A loop's name follows the profile name rule; checked before any file is read.
const nameRefusal = (name: string): string | undefined =>
  isProfileName(name)
    ? undefined
    : `"${name}" is not a loop name: use ${PROFILE_NAME_RULE}`;

// One printed line per entry, so a line break in loop text prints as a space.
const oneLine = (text: string): string => text.replace(/\s*[\r\n]\s*/g, ' ');

const stringOr = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

const depsOf = (lenv: LoopEnv): LoopDeps => ({
  env: lenv.env,
  cwd: lenv.cwd,
  home: lenv.home,
  runGit: lenv.runGit,
  managedFile: lenv.managedFile,
});

const loopDirOf = (lenv: LoopEnv, name: string): string =>
  path.join(loopsRoot(lenv.env, lenv.cwd, lenv.home), name);

// `list`

function classesText(manifest: LoopManifest): string {
  const classes = Object.entries(manifest.mandate.classes).map(
    ([name, cls]) => `${name} (${cls.state})`,
  );
  return classes.length === 0 ? '(none)' : classes.join(', ');
}

function listLine(name: string, check: LoopCheck): string {
  const verdict =
    check.issues.length === 0
      ? 'ok'
      : `refused: ${plural(check.issues.length, 'issue')} (sidekick loop show ${name} lists them)`;
  const { manifest } = check;
  if (manifest === undefined) return `${name}  ${verdict}`;
  return [
    name,
    `repo: ${oneLine(manifest.repo)}`,
    `profile: ${manifest.profile}`,
    `schedule: ${manifest.schedule}`,
    `classes: ${classesText(manifest)}`,
    verdict,
  ].join('  ');
}

const list: Verb = (rest, lenv, out, err) => {
  if (rest.length > 0) return usage(err);
  const root = loopsRoot(lenv.env, lenv.cwd, lenv.home);
  const names = loopNames(root);
  if (names.length === 0) {
    out(`the loop store ${root} holds no loop`);
    return 0;
  }
  const checked = names.map((name) => ({
    name,
    check: checkLoop(name, depsOf(lenv)),
  }));
  for (const { name, check } of checked) out(listLine(name, check));
  return checked.some(({ check }) => check.issues.length > 0) ? 1 : 0;
};

// `show`

const section = (title: string, entries: readonly string[]): string[] => [
  title,
  ...(entries.length === 0 ? [NONE] : entries.map((entry) => `  ${entry}`)),
];

const field = (key: string, value: unknown): string =>
  `${key}: ${typeof value === 'string' ? oneLine(value) : JSON.stringify(value)}`;

// Each top-level field on one line, and the mandate one list or class per line.
function definitionLines(file: string, manifest: LoopManifest | undefined) {
  const title = `definition (${file}):`;
  if (manifest === undefined) {
    return [
      title,
      `  not shown: ${LOOP_FILE} did not load; the issues say why`,
    ];
  }
  const { mandate, ...top } = manifest;
  const classes = Object.entries(mandate.classes);
  return section(title, [
    ...Object.entries(top).map(([key, value]) => field(key, value)),
    field('mandate.reads', mandate.reads),
    ...(classes.length === 0
      ? [field('mandate.classes', {})]
      : classes.map(([name, cls]) => field(`mandate.classes.${name}`, cls))),
    field('mandate.never', mandate.never),
  ]);
}

const unitText = (unit: string | undefined): string | undefined =>
  unit === undefined ? undefined : `unit ${unit}`;

// What a record line says beside its time and kind: class, command or summary, unit.
function recordParts(line: RecordLine): (string | undefined)[] {
  switch (line.kind) {
    case 'would':
    case 'request':
    case 'did':
    case 'denied':
      return [
        line.class === undefined ? undefined : `class ${line.class}`,
        line.command,
        unitText(line.unit),
      ];
    case 'note':
      return [line.summary, unitText(line.unit)];
    case 'dispatched':
      return [
        line.record === true ? 'under start --record' : undefined,
        unitText(line.unit),
      ];
    case 'landed':
      return [`commit ${line.commit}`, unitText(line.unit)];
    case 'failed':
    case 'discarded':
      return [line.reason, unitText(line.unit)];
    default: {
      const unhandled: never = line;
      throw new Error(`unhandled record ${JSON.stringify(unhandled)}`);
    }
  }
}

const recordText = (line: RecordLine): string =>
  [localMinute(new Date(line.at)), line.kind, ...recordParts(line)]
    .filter((part): part is string => part !== undefined)
    .map(oneLine)
    .join('  ');

function recordLines(dir: string, since: Date, until: Date): string[] {
  const { lines, skipped } = readRecords(dir, since, until);
  return [
    ...section(`records since ${localMinute(since)}:`, lines.map(recordText)),
    ...(skipped === 0
      ? []
      : [`  skipped ${plural(skipped, 'line')} that did not parse`]),
  ];
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Local midnight of a YYYY-MM-DD date, or undefined when the text names no real date.
function localMidnight(text: string): Date | undefined {
  const match = DATE.exec(text);
  if (match === null) return undefined;
  const [, year, month, day] = match.map(Number);
  const midnight = new Date(year, month - 1, day);
  return localDate(midnight) === text ? midnight : undefined;
}

// The listing and its warnings, or one line saying what it needs.
function listingOf(check: LoopCheck, lenv: LoopEnv) {
  const { manifest, profile } = check;
  if (manifest === undefined || profile === undefined) {
    return {
      lines: [
        'not listed: the listing needs a loop.json that parses and a profile that loads',
      ],
      warnings: [],
    };
  }
  return inheritedListing(manifest, profile, {
    runClaude: lenv.runClaude,
    configDir: configDir(lenv.env, lenv.cwd, lenv.home),
    home: lenv.home,
    managedFile: lenv.managedFile,
  });
}

type Since = { ok: true; since: Date } | { ok: false; issue: string };

// The window's start: local midnight of `--since`, or a day before `now` without it.
function sinceOf(text: string | undefined, now: Date): Since {
  if (text === undefined) {
    return { ok: true, since: new Date(now.getTime() - DAY_MS) };
  }
  const midnight = localMidnight(text);
  return midnight === undefined
    ? {
        ok: false,
        issue: `--since takes a local date as YYYY-MM-DD, got "${text}"`,
      }
    : { ok: true, since: midnight };
}

const show: Verb = (rest, lenv, out, err) => {
  const parsed = parseFlags(rest, { since: { type: 'string' } });
  if (parsed === undefined || parsed.positionals.length !== 1) {
    return usage(err);
  }
  const now = lenv.now();
  const window = sinceOf(stringOr(parsed.values.since), now);
  if (!window.ok) {
    err(window.issue);
    return usage(err);
  }
  const { since } = window;
  const [name] = parsed.positionals;
  const refusal = nameRefusal(name);
  if (refusal !== undefined) return refuse(err, [refusal]);
  const check = checkLoop(name, depsOf(lenv));
  const listing = listingOf(check, lenv);
  const definition = definitionLines(
    path.join(check.dir, LOOP_FILE),
    check.manifest,
  );
  const issues = section('issues:', check.issues);
  const refused = check.issues.length > 0;
  const lines = [
    ...(refused ? [...issues, ...definition] : [...definition, ...issues]),
    ...section('warnings:', [...check.warnings, ...listing.warnings]),
    ...section('inherited beyond the mandate:', listing.lines),
    ...recordLines(check.dir, since, now),
  ];
  for (const line of lines) out(line);
  return refused ? 1 : 0;
};

// `record`

type VerbKind = Exclude<RecordLine['kind'], ModelKind>;

// The verbs that write each kind the caps count; the model never writes them.
const VERB_WRITERS = {
  dispatched: 'only sidekick loop dispatch writes it',
  landed: 'only sidekick loop land writes it',
  failed: 'only sidekick loop reap and sidekick loop land write it',
  discarded: 'only sidekick loop discard and sidekick loop reap write it',
} satisfies Record<VerbKind, string>;

const isModelKind = (kind: string): kind is ModelKind =>
  MODEL_KINDS.some((known) => known === kind);

const isVerbKind = (kind: string): kind is VerbKind =>
  Object.hasOwn(VERB_WRITERS, kind);

type Need = 'required' | 'optional' | 'refused';

// Which of `--class` and `--command` each kind's line needs, takes, or refuses.
const FLAG_NEEDS = {
  would: { class: 'required', command: 'required' },
  request: { class: 'optional', command: 'required' },
  did: { class: 'required', command: 'required' },
  denied: { class: 'optional', command: 'required' },
  note: { class: 'refused', command: 'refused' },
} as const satisfies Record<ModelKind, Record<'class' | 'command', Need>>;

const RECORD_FLAGS = {
  kind: { type: 'string' },
  summary: { type: 'string' },
  class: { type: 'string' },
  command: { type: 'string' },
  unit: { type: 'string' },
} satisfies Record<string, FlagOption>;

type RecordArgs = {
  kind: string;
  summary: string;
  class: string | undefined;
  command: string | undefined;
  unit: string | undefined;
};

type RecordCall = { name: string; args: RecordArgs };

function parseRecordArgs(rest: string[]): RecordCall | undefined {
  const parsed = parseFlags(rest, RECORD_FLAGS);
  if (parsed === undefined || parsed.positionals.length !== 1) return undefined;
  const kind = stringOr(parsed.values.kind);
  const summary = stringOr(parsed.values.summary);
  if (kind === undefined || summary === undefined) return undefined;
  return {
    name: parsed.positionals[0],
    args: {
      kind,
      summary,
      class: stringOr(parsed.values.class),
      command: stringOr(parsed.values.command),
      unit: stringOr(parsed.values.unit),
    },
  };
}

function kindRefusal(kind: string): string {
  const writer = isVerbKind(kind)
    ? `${VERB_WRITERS[kind]}, since the caps count it; `
    : '';
  return `--kind ${kind}: ${writer}record writes ${MODEL_KIND_LIST}`;
}

function flagRefusals(kind: ModelKind, args: RecordArgs): string[] {
  const needs = FLAG_NEEDS[kind];
  return (['class', 'command'] as const).flatMap((flag) => {
    const given = args[flag] !== undefined;
    if (needs[flag] === 'required' && !given) {
      return [`--kind ${kind} needs --${flag}`];
    }
    if (needs[flag] === 'refused' && given) {
      return [
        `--kind ${kind} takes no --${flag}: its line holds a summary alone`,
      ];
    }
    return [];
  });
}

// Each refusal names the flag and the check ids, never the text.
function keyRefusals(args: RecordArgs): string[] {
  return (['summary', 'command', 'class', 'unit'] as const).flatMap((flag) => {
    const text = args[flag];
    const ids = text === undefined ? [] : keyHits(text);
    return ids.length === 0
      ? []
      : [
          `--${flag} holds text that looks like a key (${ids.join(', ')}): keep keys out of the record`,
        ];
  });
}

// The arguments' own refusals, which read no file.
function argRefusals({ name, args }: RecordCall): string[] {
  const refusal = nameRefusal(name);
  if (refusal !== undefined) return [refusal];
  if (!isModelKind(args.kind)) return [kindRefusal(args.kind)];
  return [...flagRefusals(args.kind, args), ...keyRefusals(args)];
}

// The line as the schema reads it; its bounds refuse with their own messages, each naming its flag.
function lineOf(
  args: RecordArgs,
  at: Date,
): { line: RecordLine } | { issues: string[] } {
  const candidate = {
    v: 1,
    at: at.toISOString(),
    kind: args.kind,
    summary: args.summary,
    ...(args.class === undefined ? {} : { class: args.class }),
    ...(args.command === undefined ? {} : { command: args.command }),
    ...(args.unit === undefined ? {} : { unit: args.unit }),
  };
  const parsed = v.safeParse(RecordLineSchema, candidate);
  if (parsed.success) return { line: parsed.output };
  return {
    issues: parsed.issues.map(
      (issue) => `--${v.getDotPath(issue) ?? 'kind'}: ${issue.message}`,
    ),
  };
}

// `record` checks loop.json as it is now, not as the loop was started.
function mandateRefusals(
  file: string,
  manifest: LoopManifest,
  line: RecordLine,
): string[] {
  if (!('class' in line) || line.class === undefined) return [];
  const { classes } = manifest.mandate;
  const named = line.class;
  if (!Object.hasOwn(classes, named)) {
    return [
      `--class ${named}: ${file} names no class "${named}" in mandate.classes; record checks loop.json as it is now, so a class removed since the loop started refuses until its next start`,
    ];
  }
  const { state } = classes[named];
  if (line.kind === 'did' && state !== 'act') {
    return [
      `--kind did: class "${named}" is in state ${state} in ${file}; did needs a class in act, so record it as would or ask with request`,
    ];
  }
  return [];
}

// The one line `record` prints; a request is judged new or repeat before it is appended.
function successLine(dir: string, cron: Cron, line: RecordLine): string {
  if (line.kind !== 'request') return `recorded ${line.kind}`;
  const key = { class: line.class, command: line.command, unit: line.unit };
  return isNewRequest(dir, cron, key, new Date(line.at))
    ? 'new request'
    : 'repeat request';
}

const record: Verb = (rest, lenv, out, err) => {
  const call = parseRecordArgs(rest);
  if (call === undefined) return usage(err);
  const refusals = argRefusals(call);
  if (refusals.length > 0) return refuse(err, refusals);
  const built = lineOf(call.args, lenv.now());
  if ('issues' in built) return refuse(err, built.issues);
  const dir = loopDirOf(lenv, call.name);
  const file = path.join(dir, LOOP_FILE);
  const read = readLoopManifest(file);
  if (!read.ok) return refuse(err, read.issues);
  const { line } = built;
  const mandate = mandateRefusals(file, read.manifest, line);
  if (mandate.length > 0) return refuse(err, mandate);
  // The schema already ran parseCron on the schedule, so this refuses only if the two drift apart.
  const cron = parseCron(read.manifest.schedule);
  if (!cron.ok) return refuse(err, [`${file}: schedule: ${cron.issue}`]);
  const printed = successLine(dir, cron.cron, line);
  appendRecord(dir, line);
  out(printed);
  return 0;
};

const VERBS: Record<string, Verb> = { list, show, record };

/** Dispatch one `loop` verb; returns the process exit code. */
export function runLoopCli(
  args: string[],
  lenv: LoopEnv,
  out: Out,
  err: Out,
): number {
  const [verb, ...rest] = args;
  if (verb === undefined || !Object.hasOwn(VERBS, verb)) return usage(err);
  return VERBS[verb](rest, lenv, out, err);
}
