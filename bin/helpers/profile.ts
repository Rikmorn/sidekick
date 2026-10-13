/**
 * `sidekick profile list|show|new|argv|launch|alias`: the verbs over a profile
 * store. Usage errors and refusals print to stderr and return 1, as the `pm`
 * and `hook` families do.
 */
import { parseArgs } from 'node:util';
import {
  bgArgs,
  type CheckResult,
  type ClaudeRunner,
  checkSettings,
  composeSettings,
  launchArgs,
  SKIP_VARIABLE,
} from './profile-launch.js';
import {
  aliasNameRefusal,
  type Shell,
  shellFunction,
} from './profile-shell.js';
import {
  listProfiles,
  loadProfile,
  newProfile,
  type Profile,
  storeRoots,
} from './profile-store.js';

export const PROFILE_USAGE_LINE =
  'sidekick profile list|show <name>|new <name> --description <text>|argv <name>|launch --bg <name> [-n <session>] [-- <prompt>]|alias [--shell zsh|bash] [<name>...]';

export interface ProfileEnv {
  env: NodeJS.ProcessEnv;
  cwd: string;
  home: string;
  /** Where the settings check keeps its temp file. */
  tmpdir: string;
  runClaude: ClaudeRunner;
  /** Raw stdout, for `argv`'s NUL-terminated arguments. */
  write: (chunk: string) => void;
  /** The bound on a `launch --bg` start; defaults to a minute. */
  launchTimeoutMs?: number;
}

type Out = (line: string) => void;
type Verb = (rest: string[], penv: ProfileEnv, out: Out, err: Out) => number;

const SHELLS: readonly Shell[] = ['zsh', 'bash'];

const withoutTrailingNewline = (text: string): string =>
  text.replace(/\n$/, '');

interface Parsed {
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
}

// Strict: an unknown flag or a missing value is a usage error.
function parseFlags(
  rest: string[],
  options: Record<string, { type: 'string' | 'boolean'; short?: string }>,
): Parsed | undefined {
  try {
    const { values, positionals } = parseArgs({
      args: rest,
      options,
      allowPositionals: true,
      strict: true,
    });
    return { values, positionals };
  } catch {
    return undefined;
  }
}

const usage = (err: Out): number => {
  err(`usage: ${PROFILE_USAGE_LINE}`);
  return 1;
};

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return 1;
};

function load(
  name: string,
  penv: ProfileEnv,
): { profile: Profile } | { issues: string[] } {
  const loaded = loadProfile(name, storeRoots(penv.env, penv.cwd, penv.home));
  return loaded.ok ? { profile: loaded.profile } : { issues: loaded.issues };
}

const composed = (profile: Profile, penv: ProfileEnv) => {
  const settings = composeSettings(profile, { home: penv.home });
  return { settings, args: launchArgs(profile, settings) };
};

const runCheck = (
  settings: ReturnType<typeof composed>['settings'],
  penv: ProfileEnv,
): CheckResult =>
  checkSettings(settings, {
    run: penv.runClaude,
    cwd: penv.cwd,
    tmpdir: penv.tmpdir,
    skip: penv.env[SKIP_VARIABLE] === '1',
  });

const list: Verb = (rest, penv, out, err) => {
  if (rest.length > 0) return usage(err);
  const profiles = listProfiles(storeRoots(penv.env, penv.cwd, penv.home));
  for (const p of profiles) {
    out(
      p.issues.length > 0
        ? `${p.name}  invalid: ${p.issues[0]}  (${p.root})`
        : `${p.name}  ${p.description}  (${p.root})`,
    );
  }
  return profiles.some((p) => p.issues.length > 0) ? 1 : 0;
};

const show: Verb = (rest, penv, out, err) => {
  const parsed = parseFlags(rest, {});
  if (parsed === undefined || parsed.positionals.length !== 1) {
    return usage(err);
  }
  const loaded = load(parsed.positionals[0], penv);
  if ('issues' in loaded) return refuse(err, loaded.issues);
  const { profile } = loaded;
  const { settings, args } = composed(profile, penv);
  out(`folder: ${profile.dir}`);
  out(`manifest: ${JSON.stringify(profile.manifest, null, 2)}`);
  out(`settings: ${JSON.stringify(settings, null, 2)}`);
  out('arguments:');
  for (const arg of args) out(arg);
  return 0;
};

const create: Verb = (rest, penv, out, err) => {
  const parsed = parseFlags(rest, { description: { type: 'string' } });
  const description = parsed?.values.description;
  if (
    parsed === undefined ||
    parsed.positionals.length !== 1 ||
    typeof description !== 'string'
  ) {
    return usage(err);
  }
  const created = newProfile(
    parsed.positionals[0],
    description,
    storeRoots(penv.env, penv.cwd, penv.home),
  );
  if (!created.ok) return refuse(err, created.issues);
  out(created.dir);
  return 0;
};

const argv: Verb = (rest, penv, _out, err) => {
  const parsed = parseFlags(rest, {});
  if (parsed === undefined || parsed.positionals.length !== 1) {
    return usage(err);
  }
  const loaded = load(parsed.positionals[0], penv);
  if ('issues' in loaded) return refuse(err, loaded.issues);
  const { settings, args } = composed(loaded.profile, penv);
  const checked = runCheck(settings, penv);
  if (!checked.ok) return refuse(err, checked.issues);
  for (const warning of checked.warnings) err(warning);
  penv.write(args.map((arg) => `${arg}\0`).join(''));
  return 0;
};

const launch: Verb = (rest, penv, out, err) => {
  const split = rest.indexOf('--');
  const before = split === -1 ? rest : rest.slice(0, split);
  const words = split === -1 ? [] : rest.slice(split + 1);
  const parsed = parseFlags(before, {
    bg: { type: 'boolean' },
    n: { type: 'string', short: 'n' },
  });
  if (parsed === undefined || parsed.positionals.length !== 1) {
    return usage(err);
  }
  if (parsed.values.bg !== true) {
    return refuse(err, [
      'launch only starts background sessions: pass --bg.',
      'For an interactive start, use the shell function: skp <name> (sidekick profile alias prints it).',
    ]);
  }
  const loaded = load(parsed.positionals[0], penv);
  if ('issues' in loaded) return refuse(err, loaded.issues);
  const { settings, args } = composed(loaded.profile, penv);
  const checked = runCheck(settings, penv);
  if (!checked.ok) return refuse(err, checked.issues);
  for (const warning of checked.warnings) err(warning);
  // The bound on a `--bg` start, chosen as a generous minute.
  const { launchTimeoutMs = 60_000 } = penv;
  const sessionName = parsed.values.n;
  const result = penv.runClaude(
    bgArgs(args, {
      sessionName: typeof sessionName === 'string' ? sessionName : undefined,
      prompt: words.length > 0 ? words.join(' ') : undefined,
    }),
    { cwd: penv.cwd, timeoutMs: launchTimeoutMs },
  );
  if (result.stdout !== '') out(withoutTrailingNewline(result.stdout));
  if (result.stderr !== '') err(withoutTrailingNewline(result.stderr));
  if (result.timedOut) err('claude did not return in time.');
  return result.code;
};

const isShell = (value: unknown): value is Shell =>
  SHELLS.some((shell) => shell === value);

const alias: Verb = (rest, penv, out, err) => {
  const parsed = parseFlags(rest, { shell: { type: 'string' } });
  if (parsed === undefined) return usage(err);
  const shell = parsed.values.shell ?? 'zsh';
  if (!isShell(shell)) {
    return refuse(err, [
      `unknown shell "${String(shell)}": use ${SHELLS.join(' or ')}`,
    ]);
  }
  const issues = parsed.positionals.flatMap((name) => {
    const refusal = aliasNameRefusal(name);
    if (refusal !== undefined) return [refusal];
    const loaded = load(name, penv);
    return 'issues' in loaded ? loaded.issues : [];
  });
  if (issues.length > 0) return refuse(err, issues);
  out(withoutTrailingNewline(shellFunction(shell, parsed.positionals)));
  return 0;
};

const VERBS: Record<string, Verb> = {
  list,
  show,
  new: create,
  argv,
  launch,
  alias,
};

/** Dispatch one `profile` verb; returns the process exit code. */
export function runProfileCli(
  args: string[],
  penv: ProfileEnv,
  out: Out,
  err: Out,
): number {
  const [name, ...rest] = args;
  if (name === undefined || !Object.hasOwn(VERBS, name)) return usage(err);
  return VERBS[name](rest, penv, out, err);
}
