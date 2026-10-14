/**
 * `sidekick profile list|show|new|argv|launch|alias|switch`: the verbs over a profile
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
  checkPlugins,
  needsPluginCheck,
  PLUGIN_SKIP_VARIABLE,
} from './profile-plugins.js';
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
  'sidekick profile list|show <name>|new <name> --description <text> [--repo]|argv <name>|launch --bg <name> [-n <session>] [-- <prompt>]|alias [--shell zsh|bash] [<name>...]|switch <name> [--session <id>]';

export interface ProfileEnv {
  env: NodeJS.ProcessEnv;
  cwd: string;
  home: string;
  /** The enclosing git work tree's top folder, or undefined outside one. */
  workTree: string | undefined;
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
  const loaded = loadProfile(
    name,
    storeRoots(penv.env, penv.cwd, penv.home, penv.workTree),
  );
  return loaded.ok ? { profile: loaded.profile } : { issues: loaded.issues };
}

/** One line saying where a repo profile came from, or undefined for a user-store one. */
export function provenanceLine(profile: Profile): string | undefined {
  if (profile.store === 'user') return undefined;
  const shadows =
    profile.shadows === undefined ? '' : ` (it shadows ${profile.shadows})`;
  return `profile "${profile.name}" comes from the ${profile.store} store: ${profile.dir}${shadows}`;
}

const composed = (profile: Profile, penv: ProfileEnv) => {
  const settings = composeSettings(profile, { home: penv.home });
  return { settings, args: launchArgs(profile, settings) };
};

const settingsCheck = (
  settings: ReturnType<typeof composed>['settings'],
  penv: ProfileEnv,
): CheckResult =>
  checkSettings(settings, {
    run: penv.runClaude,
    cwd: penv.cwd,
    tmpdir: penv.tmpdir,
    skip: penv.env[SKIP_VARIABLE] === '1',
  });

const pluginCheck = (
  profile: Profile,
  settings: ReturnType<typeof composed>['settings'],
  penv: ProfileEnv,
): CheckResult =>
  checkPlugins(settings, profile.manifest, {
    run: penv.runClaude,
    cwd: penv.cwd,
    tmpdir: penv.tmpdir,
    skip: penv.env[PLUGIN_SKIP_VARIABLE] === '1',
  });

/** Runs the `doctor` check, then the plugin check when `doctor` passes and the manifest needs it. */
export function checkProfile(
  profile: Profile,
  settings: ReturnType<typeof composed>['settings'],
  penv: ProfileEnv,
): CheckResult {
  const checked = settingsCheck(settings, penv);
  if (!checked.ok || !needsPluginCheck(profile.manifest)) return checked;
  const plugins = pluginCheck(profile, settings, penv);
  return plugins.ok
    ? { ok: true, warnings: [...checked.warnings, ...plugins.warnings] }
    : plugins;
}

/** The `plugins:` lines of `show`, which runs the plugin check without `doctor` and never refuses on it. */
function pluginReport(
  profile: Profile,
  settings: ReturnType<typeof composed>['settings'],
  penv: ProfileEnv,
): string[] {
  if (!needsPluginCheck(profile.manifest)) {
    return [
      'plugins: not checked; the profile sets neither settings.enabledPlugins nor settingSources',
    ];
  }
  const plugins = pluginCheck(profile, settings, penv);
  return plugins.ok
    ? ['plugins: ok', ...plugins.warnings.map((w) => `  ${w}`)]
    : ['plugins: refused', ...plugins.issues.map((i) => `  ${i}`)];
}

const list: Verb = (rest, penv, out, err) => {
  if (rest.length > 0) return usage(err);
  const profiles = listProfiles(
    storeRoots(penv.env, penv.cwd, penv.home, penv.workTree),
  );
  for (const p of profiles) {
    const shadowed =
      p.shadowedBy === undefined ? '' : `, shadowed by ${p.shadowedBy}`;
    const where = `(${p.store}: ${p.root}${shadowed})`;
    out(
      p.issues.length > 0
        ? `${p.name}  invalid: ${p.issues[0]}  ${where}`
        : `${p.name}  ${p.description}  ${where}`,
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
  out(`store: ${profile.store}`);
  out(`manifest: ${JSON.stringify(profile.manifest, null, 2)}`);
  out(`settings: ${JSON.stringify(settings, null, 2)}`);
  for (const line of pluginReport(profile, settings, penv)) out(line);
  out('arguments:');
  for (const arg of args) out(arg);
  return 0;
};

const create: Verb = (rest, penv, out, err) => {
  const parsed = parseFlags(rest, {
    description: { type: 'string' },
    repo: { type: 'boolean' },
  });
  const description = parsed?.values.description;
  if (
    parsed === undefined ||
    parsed.positionals.length !== 1 ||
    typeof description !== 'string'
  ) {
    return usage(err);
  }
  const wantsRepo = parsed.values.repo === true;
  if (wantsRepo && penv.env.SIDEKICK_PROFILES_DIR) {
    return refuse(err, [
      'SIDEKICK_PROFILES_DIR is set, so there is no repo store',
    ]);
  }
  if (wantsRepo && penv.workTree === undefined) {
    return refuse(err, [
      'not inside a git work tree, so there is no repo store',
    ]);
  }
  const wanted = wantsRepo ? 'repo' : 'user';
  const root = storeRoots(penv.env, penv.cwd, penv.home, penv.workTree).find(
    (r) => r.kind === wanted,
  );
  // Unreachable: the refusals above cover each way a root can be missing.
  if (root === undefined) return refuse(err, [`no ${wanted} store root`]);
  const created = newProfile(parsed.positionals[0], description, root.dir);
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
  const provenance = provenanceLine(loaded.profile);
  if (provenance !== undefined) err(provenance);
  const { settings, args } = composed(loaded.profile, penv);
  const checked = checkProfile(loaded.profile, settings, penv);
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
  const provenance = provenanceLine(loaded.profile);
  if (provenance !== undefined) err(provenance);
  const { settings, args } = composed(loaded.profile, penv);
  const checked = checkProfile(loaded.profile, settings, penv);
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

// POSIX single quoting: a quote inside closes the string, adds an escaped quote, and reopens.
const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

const switchProfile: Verb = (rest, penv, out, err) => {
  const parsed = parseFlags(rest, { session: { type: 'string' } });
  if (parsed === undefined || parsed.positionals.length !== 1) {
    return usage(err);
  }
  const [name] = parsed.positionals;
  const flagged = parsed.values.session;
  const sessionId =
    typeof flagged === 'string' && flagged !== ''
      ? flagged
      : penv.env.CLAUDE_CODE_SESSION_ID;
  if (sessionId === undefined || sessionId === '') {
    return refuse(err, [
      'no session id: run switch inside a session, or pass --session <id>',
    ]);
  }
  const loaded = load(name, penv);
  if ('issues' in loaded) return refuse(err, loaded.issues);
  const provenance = provenanceLine(loaded.profile);
  if (provenance !== undefined) err(provenance);
  const { settings } = composed(loaded.profile, penv);
  const checked = checkProfile(loaded.profile, settings, penv);
  if (!checked.ok) return refuse(err, checked.issues);
  for (const warning of checked.warnings) err(warning);
  const cd = `cd ${shellQuote(penv.cwd)}`;
  out(`To switch this session to "${name}", type /exit, then run one:`);
  out(
    `  ${cd} && skp ${name} --resume ${shellQuote(sessionId)}   # keep the conversation`,
  );
  out(`  ${cd} && skp ${name}                   # start fresh`);
  out(
    `After a resume, skills of plugins "${name}" turns off stay listed but fail when called.`,
  );
  return 0;
};

const VERBS: Record<string, Verb> = {
  list,
  show,
  new: create,
  argv,
  launch,
  alias,
  switch: switchProfile,
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
