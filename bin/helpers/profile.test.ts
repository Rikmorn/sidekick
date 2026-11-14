import { afterEach, describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execRunner } from './pm-data.js';
import { type ProfileEnv, parseFlags, runProfileCli } from './profile.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import { workTreeRootOf } from './rules.js';
import { SIDEKICK_DEPENDENCY_IDS, SIDEKICK_ID } from './sidekick-plugin.js';

const made: string[] = [];
const tmp = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-profile-cli-'));
  made.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of made.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const mkProfile = (store: string, name: string, manifest: object): string => {
  const dir = path.join(store, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(manifest));
  return dir;
};

const ok = (over: Partial<ClaudeResult> = {}): ClaudeResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
});

interface Call {
  args: string[];
  opts: { cwd: string; timeoutMs: number };
}

/**
 * A runner that answers `doctor` with the canary's line, answers
 * `plugin list --json` with `state.pluginList`, and records every call.
 */
function fakeRunner(launchResult: ClaudeResult = ok()) {
  const calls: Call[] = [];
  const state = { pluginList: '[]' };
  const run: ClaudeRunner = (args, opts) => {
    calls.push({ args, opts });
    if (args.at(-3) === 'plugin' && args.at(-2) === 'list') {
      return ok({ stdout: state.pluginList });
    }
    if (args.at(-1) === 'doctor') {
      const file = args[args.indexOf('--settings') + 1];
      const key = Object.keys(JSON.parse(fs.readFileSync(file, 'utf-8'))).find(
        (k) => k === 'feedbackSurveyRate' || k === 'cleanupPeriodDays',
      );
      return ok({
        stdout: `Invalid settings\n- ${file} › ${key}: Expected number, but received string\n\n`,
      });
    }
    return launchResult;
  };
  return { run, calls, state };
}

function harness(over: Partial<ProfileEnv> = {}) {
  const store = tmp();
  const runner = fakeRunner();
  const out: string[] = [];
  const err: string[] = [];
  const written: string[] = [];
  const penv: ProfileEnv = {
    env: { SIDEKICK_PROFILES_DIR: store },
    cwd: tmp(),
    home: '/home/test',
    tmpdir: tmp(),
    runClaude: runner.run,
    runGit: execRunner,
    write: (c) => written.push(c),
    workTree: { kind: 'outside' },
    ...over,
  };
  const run = (...args: string[]) =>
    runProfileCli(
      args,
      penv,
      (l) => out.push(l),
      (l) => err.push(l),
    );
  return { store, runner, out, err, written, penv, run };
}

describe('parseFlags', () => {
  const options = {
    folder: { type: 'string', multiple: true },
    json: { type: 'boolean' },
  } as const;

  test('a multiple option that never appears is an empty list', () => {
    expect(parseFlags(['--json'], options)?.lists).toEqual({ folder: [] });
  });

  test('a multiple option keeps its values in the order given', () => {
    const args = ['--folder', 'b', '--folder', 'a'];
    expect(parseFlags(args, options)?.lists).toEqual({ folder: ['b', 'a'] });
  });
});

describe('profile list', () => {
  test('prints nothing and returns 0 on a missing store', () => {
    const h = harness();
    fs.rmSync(h.store, { recursive: true });
    expect(h.run('list')).toBe(0);
    expect(h.out).toEqual([]);
  });
  test('shows name, description, and root', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'Alpha' });
    expect(h.run('list')).toBe(0);
    expect(h.out).toEqual([`a  Alpha  (user: ${path.resolve(h.store)})`]);
  });
  test('keeps a description that holds line breaks on one line', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'line one\nsecond line' });
    mkProfile(h.store, 'b', { description: 'first\r\n  second' });
    expect(h.run('list')).toBe(0);
    const root = path.resolve(h.store);
    expect(h.out).toEqual([
      `a  line one second line  (user: ${root})`,
      `b  first second  (user: ${root})`,
    ]);
  });
  test('shows invalid: for a broken profile and returns 1', () => {
    const h = harness();
    mkProfile(h.store, 'bad', { nope: 1 });
    expect(h.run('list')).toBe(1);
    expect(h.out[0]).toContain('bad  invalid:');
  });
});

describe('profile show', () => {
  test('prints folder, manifest, settings, and arguments, and never runs doctor', () => {
    const h = harness();
    const dir = mkProfile(h.store, 'a', {
      description: 'Alpha',
      settingSources: ['project'],
    });
    expect(h.run('show', 'a')).toBe(0);
    const text = h.out.join('\n');
    expect(text).toContain(`folder: ${dir}`);
    expect(text).toContain('"description": "Alpha"');
    expect(text).toContain('"profile": "a"');
    expect(h.out).toContain('--add-dir');
    expect(h.out).toContain(dir);
    expect(h.out).toContain('--setting-sources');
    expect(h.runner.calls.some((c) => c.args.at(-1) === 'doctor')).toBe(false);
  });
  test('refuses an unknown profile', () => {
    const h = harness();
    expect(h.run('show', 'ghost')).toBe(1);
    expect(h.err[0]).toContain('no profile named "ghost"');
  });
});

const unmet = JSON.stringify([
  {
    id: 'a@m',
    errorDetails: [
      { type: 'dependency-unsatisfied', plugin: 'a@m', dependency: 'b@m' },
    ],
  },
]);
const withPlugins = { description: 'A', settings: { enabledPlugins: {} } };
const callWords = (h: ReturnType<typeof harness>): string[] =>
  h.runner.calls.map((c) => c.args.at(-1) ?? '');

describe('the plugin dependency check', () => {
  test('argv runs doctor, then plugin list, and writes the arguments', () => {
    const h = harness();
    mkProfile(h.store, 'a', withPlugins);
    expect(h.run('argv', 'a')).toBe(0);
    expect(callWords(h)).toEqual(['doctor', '--json']);
    expect(h.runner.calls[1].args.slice(-3)).toEqual([
      'plugin',
      'list',
      '--json',
    ]);
    expect(h.written.length).toBe(1);
  });
  test('argv refuses, writing nothing, on an unmet dependency, naming the plugin and the fix', () => {
    const h = harness();
    h.runner.state.pluginList = unmet;
    mkProfile(h.store, 'a', withPlugins);
    expect(h.run('argv', 'a')).toBe(1);
    expect(h.written).toEqual([]);
    expect(h.out).toEqual([]);
    expect(h.err.join('\n')).toContain('a@m needs b@m');
    expect(h.err.join('\n')).toContain('settings.enabledPlugins');
  });
  test('a profile that sets neither key never runs plugin list', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('argv', 'a')).toBe(0);
    expect(callWords(h)).toEqual(['doctor']);
  });
  test('a doctor refusal never runs plugin list', () => {
    const h = harness({ runClaude: () => ok({ stdout: 'no report\n' }) });
    const calls: string[][] = [];
    const inner = h.penv.runClaude;
    h.penv.runClaude = (args, opts) => {
      calls.push(args);
      return inner(args, opts);
    };
    mkProfile(h.store, 'a', withPlugins);
    expect(h.run('argv', 'a')).toBe(1);
    expect(calls.length).toBe(1);
    expect(h.written).toEqual([]);
  });
  test('SIDEKICK_PROFILE_SKIP_PLUGIN_CHECK=1 skips plugin list, warns on err, and still runs doctor', () => {
    const h = harness();
    h.penv.env = { ...h.penv.env, SIDEKICK_PROFILE_SKIP_PLUGIN_CHECK: '1' };
    mkProfile(h.store, 'a', withPlugins);
    expect(h.run('argv', 'a')).toBe(0);
    expect(callWords(h)).toEqual(['doctor']);
    expect(h.err.join('\n')).toContain('SIDEKICK_PROFILE_SKIP_PLUGIN_CHECK=1');
  });
  test('SIDEKICK_PROFILE_SKIP_CHECK=1 skips doctor only', () => {
    const h = harness();
    h.penv.env = { ...h.penv.env, SIDEKICK_PROFILE_SKIP_CHECK: '1' };
    mkProfile(h.store, 'a', withPlugins);
    expect(h.run('argv', 'a')).toBe(0);
    expect(callWords(h)).toEqual(['--json']);
  });
  test('launch --bg refuses before starting the session when the check refuses', () => {
    const h = harness();
    h.runner.state.pluginList = unmet;
    mkProfile(h.store, 'a', withPlugins);
    expect(h.run('launch', '--bg', 'a')).toBe(1);
    expect(h.runner.calls.some((c) => c.args.includes('--bg'))).toBe(false);
    expect(h.err.join('\n')).toContain('a@m needs b@m');
  });
  test('a warning reaches err and never argv stdout', () => {
    const h = harness();
    h.runner.state.pluginList = JSON.stringify([
      { id: 'a@m', errorDetails: [{ type: 'mystery' }] },
    ]);
    mkProfile(h.store, 'a', withPlugins);
    expect(h.run('argv', 'a')).toBe(0);
    expect(h.err.join('\n')).toContain(
      'a@m: claude plugin list reports mystery',
    );
    expect(h.out).toEqual([]);
    expect(h.written.join('')).not.toContain('mystery');
  });
  test('show reports the refusal on stdout and exits 0', () => {
    const h = harness();
    h.runner.state.pluginList = unmet;
    mkProfile(h.store, 'a', withPlugins);
    expect(h.run('show', 'a')).toBe(0);
    expect(h.out.join('\n')).toContain('plugins: refused');
    expect(h.out.join('\n')).toContain('a@m needs b@m');
    expect(h.err).toEqual([]);
    expect(callWords(h)).toEqual(['--json']);
  });
  test('show and argv name the profile file in a plugin refusal', () => {
    const h = harness();
    h.runner.state.pluginList = unmet;
    const file = path.join(
      mkProfile(h.store, 'a', withPlugins),
      'profile.json',
    );
    expect(h.run('show', 'a')).toBe(0);
    expect(h.out.join('\n')).toContain(file);
    expect(h.run('argv', 'a')).toBe(1);
    expect(h.err.join('\n')).toContain(file);
  });
  test('show names the file and the id for an unlisted plugin id', () => {
    const h = harness();
    h.runner.state.pluginList = '[]';
    const file = path.join(
      mkProfile(h.store, 'a', {
        description: 'A',
        settings: { enabledPlugins: { 'gone@x': true } },
      }),
      'profile.json',
    );
    expect(h.run('show', 'a')).toBe(0);
    expect(h.out.join('\n')).toContain(file);
    expect(h.out.join('\n')).toContain('"gone@x"');
  });
  test('show reports ok', () => {
    const h = harness();
    mkProfile(h.store, 'a', withPlugins);
    expect(h.run('show', 'a')).toBe(0);
    expect(h.out).toContain('plugins: ok');
  });
  test('show says no check was needed when the profile sets neither key', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('show', 'a')).toBe(0);
    expect(h.out.join('\n')).toContain(
      'plugins: not checked; the profile sets none of settings.enabledPlugins, settingSources, and pluginDirs',
    );
    expect(h.runner.calls).toEqual([]);
  });
  test('show says the check did not run when the skip variable is set', () => {
    const h = harness();
    h.penv.env = { ...h.penv.env, SIDEKICK_PROFILE_SKIP_PLUGIN_CHECK: '1' };
    mkProfile(h.store, 'a', withPlugins);
    expect(h.run('show', 'a')).toBe(0);
    const report = h.out.filter((line) =>
      /^\s*plugins:|SKIP_PLUGIN/.test(line),
    );
    expect(report).toEqual([
      'plugins: not checked; SIDEKICK_PROFILE_SKIP_PLUGIN_CHECK=1 is set',
    ]);
    expect(h.runner.calls).toEqual([]);
  });
});

describe('profile new', () => {
  test('prints the path of the new folder', () => {
    const h = harness();
    expect(h.run('new', 'fresh', '--description', 'Fresh')).toBe(0);
    expect(h.out).toEqual([path.join(path.resolve(h.store), 'fresh')]);
    expect(fs.existsSync(path.join(h.store, 'fresh', 'profile.json'))).toBe(
      true,
    );
  });
  test('refuses a missing --description', () => {
    const h = harness();
    expect(h.run('new', 'fresh')).toBe(1);
    expect(h.err[0]).toContain('usage:');
  });
  test('refuses an invalid name', () => {
    const h = harness();
    expect(h.run('new', 'Bad_Name', '--description', 'x')).toBe(1);
    expect(h.err[0]).toContain('1 to 64 lowercase letters');
  });
  test('refuses an unknown flag', () => {
    const h = harness();
    expect(
      h.run('new', 'fresh', '--description', 'x', '--descripton', 'y'),
    ).toBe(1);
  });
  test('makes the sidekick folder a repo before the first user profile', () => {
    const home = fs.realpathSync(tmp());
    const h = harness({ env: {}, home });
    expect(h.run('new', 'x', '--description', 'd')).toBe(0);
    const folder = path.join(home, '.claude', 'sidekick');
    expect(fs.existsSync(path.join(folder, '.git'))).toBe(true);
    expect(fs.readFileSync(path.join(folder, '.gitignore'), 'utf-8')).toBe(
      'loops/*/records/\nloops/*/state.json\n',
    );
    expect(
      fs.existsSync(path.join(folder, 'profiles', 'x', 'profile.json')),
    ).toBe(true);
  });
  test('makes no repo with SIDEKICK_PROFILES_DIR set', () => {
    const home = fs.realpathSync(tmp());
    const h = harness({ home });
    expect(h.run('new', 'x', '--description', 'd')).toBe(0);
    expect(fs.existsSync(path.join(home, '.claude', 'sidekick'))).toBe(false);
  });
  test('makes no repo with --repo', () => {
    const top = fs.realpathSync(tmp());
    const home = fs.realpathSync(tmp());
    const h = harness({
      env: {},
      home,
      cwd: top,
      workTree: { kind: 'inside', top },
    });
    expect(h.run('new', 'x', '--description', 'd', '--repo')).toBe(0);
    expect(fs.existsSync(path.join(home, '.claude', 'sidekick'))).toBe(false);
  });
});

describe('a dotfiles repo at home with the bridge link', () => {
  const bridged = () => {
    const home = fs.realpathSync(tmp());
    spawnSync('git', ['init', '-q'], { cwd: home });
    const store = path.join(home, '.claude', 'sidekick', 'profiles');
    fs.mkdirSync(store, { recursive: true });
    fs.symlinkSync(store, path.join(home, '.claude', 'profiles'));
    mkProfile(store, 'p', { description: 'P' });
    return harness({
      env: {},
      home,
      cwd: home,
      workTree: { kind: 'inside', top: home },
    });
  };

  test('list shows each profile once', () => {
    const h = bridged();
    expect(h.run('list')).toBe(0);
    expect(h.out.filter((l) => l.startsWith('p '))).toHaveLength(1);
  });
  test('new --repo exits 1 with the user-store message', () => {
    const h = bridged();
    expect(h.run('new', 'x', '--description', 'd', '--repo')).toBe(1);
    expect(h.err).toEqual([
      'the repo store is the user store here, so --repo has nowhere else to write',
    ]);
  });
});

describe('profile show and the memory key', () => {
  const repoWithKey = (key: string): string => {
    const repo = fs.realpathSync(tmp());
    spawnSync('git', ['init', '-q'], { cwd: repo });
    fs.mkdirSync(path.join(repo, '.claude'));
    fs.writeFileSync(
      path.join(repo, '.claude', 'settings.local.json'),
      JSON.stringify({ autoMemoryDirectory: key }),
    );
    return repo;
  };

  test('sources without local and user carry the key and the store', () => {
    const cwd = repoWithKey('/m/repo');
    const h = harness({
      cwd,
      env: {
        SIDEKICK_PROFILES_DIR: tmp(),
        SIDEKICK_MEMORY_STORE: '/m',
      },
    });
    mkProfile(h.penv.env.SIDEKICK_PROFILES_DIR ?? '', 'a', {
      description: 'A',
      settingSources: ['project'],
    });
    expect(h.run('show', 'a')).toBe(0);
    const text = h.out.join('\n');
    expect(text).toContain('"autoMemoryDirectory": "/m/repo"');
    expect(text).toContain('"/m"');
  });

  test('a repo with no key leaves the settings as they were', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A', settingSources: ['project'] });
    expect(h.run('show', 'a')).toBe(0);
    expect(h.out.join('\n')).not.toContain('autoMemoryDirectory');
  });
});

describe('profile argv', () => {
  test('writes each argument NUL-terminated and nothing to out', () => {
    const h = harness();
    const dir = mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('argv', 'a')).toBe(0);
    const parts = h.written.join('').split('\0');
    expect(parts.pop()).toBe('');
    expect(parts[0]).toBe('--add-dir');
    expect(parts[1]).toBe(dir);
    expect(parts[2]).toBe('--settings');
    expect(h.out).toEqual([]);
  });
  test('a refused check writes nothing and returns 1', () => {
    const h = harness({
      runClaude: () => ok({ stdout: 'no report at all\n' }),
    });
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('argv', 'a')).toBe(1);
    expect(h.written).toEqual([]);
    expect(h.err.join('\n')).toContain('no longer parses');
  });
  test('SIDEKICK_PROFILE_SKIP_CHECK=1 skips the runner and warns', () => {
    const h = harness();
    h.penv.env = { ...h.penv.env, SIDEKICK_PROFILE_SKIP_CHECK: '1' };
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('argv', 'a')).toBe(0);
    expect(h.runner.calls).toEqual([]);
    expect(h.err.join('\n')).toContain('SIDEKICK_PROFILE_SKIP_CHECK=1');
    expect(h.written.length).toBe(1);
  });
});

describe('profile launch', () => {
  test('refuses without --bg and points at skp', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('launch', 'a')).toBe(1);
    expect(h.err.join('\n')).toContain('skp');
    expect(h.runner.calls).toEqual([]);
  });
  test('passes the profile arguments, --bg, -n, and the prompt as one argument after --', () => {
    const h = harness();
    const dir = mkProfile(h.store, 'bench', { description: 'B' });
    expect(
      h.run(
        'launch',
        '--bg',
        'bench',
        '-n',
        'w1',
        '--',
        '--fix',
        'the',
        'tests',
      ),
    ).toBe(0);
    const launched = h.runner.calls.at(-1);
    expect(launched?.args.slice(0, 2)).toEqual(['--add-dir', dir]);
    expect(launched?.args.slice(-5)).toEqual([
      '--bg',
      '-n',
      'w1',
      '--',
      '--fix the tests',
    ]);
    expect(launched?.opts.timeoutMs).toBe(60_000);
  });
  test('--plugin-dir follows the profile plugin dirs and comes before --bg', () => {
    const h = harness();
    const dir = mkProfile(h.store, 'a', {
      description: 'A',
      pluginDirs: ['plugin'],
    });
    fs.mkdirSync(path.join(dir, 'plugin'));
    fs.mkdirSync(path.join(h.penv.cwd, 'x'));
    expect(
      h.run('launch', '--bg', 'a', '--plugin-dir', './x', '--', 'hi'),
    ).toBe(0);
    const args = h.runner.calls.at(-1)?.args ?? [];
    const pluginDirs = args.flatMap((a, i) =>
      args[i - 1] === '--plugin-dir' ? [a] : [],
    );
    expect(pluginDirs).toEqual([
      path.join(dir, 'plugin'),
      path.join(h.penv.cwd, 'x'),
    ]);
    expect(
      args.indexOf('--plugin-dir', args.indexOf('--settings')),
    ).toBeLessThan(args.indexOf('--bg'));
    expect(args.slice(-3)).toEqual(['--bg', '--', 'hi']);
  });
  test('the plugin check passes every plugin dir the launch passes', () => {
    const h = harness();
    const dir = mkProfile(h.store, 'a', {
      description: 'A',
      pluginDirs: ['plugin'],
    });
    fs.mkdirSync(path.join(dir, 'plugin'));
    fs.mkdirSync(path.join(h.penv.cwd, 'x'));
    expect(h.run('launch', '--bg', 'a', '--plugin-dir', 'x')).toBe(0);
    const listed = h.runner.calls.find((c) => c.args.includes('plugin'));
    expect(listed?.args.slice(0, 4)).toEqual([
      '--plugin-dir',
      path.join(dir, 'plugin'),
      '--plugin-dir',
      path.join(h.penv.cwd, 'x'),
    ]);
  });
  test('a profile with only pluginDirs runs the plugin check', () => {
    const h = harness();
    const dir = mkProfile(h.store, 'a', {
      description: 'A',
      pluginDirs: ['plugin'],
    });
    fs.mkdirSync(path.join(dir, 'plugin'));
    expect(h.run('argv', 'a')).toBe(0);
    expect(callWords(h)).toEqual(['doctor', '--json']);
  });
  test('--plugin-dir that is not a folder is refused before any claude call', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('launch', '--bg', 'a', '--plugin-dir', 'nowhere')).toBe(1);
    expect(h.err).toContain(
      `--plugin-dir: ${path.join(h.penv.cwd, 'nowhere')} is not a folder`,
    );
    expect(h.runner.calls).toEqual([]);
  });
  test('an empty --plugin-dir is a usage error', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('launch', '--bg', 'a', '--plugin-dir', '')).toBe(1);
    expect(h.err.join('\n')).toContain('usage:');
  });
  test('a repeated --plugin-dir is a usage error naming the flag, before any claude call', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    fs.mkdirSync(path.join(h.penv.cwd, 'x'));
    fs.mkdirSync(path.join(h.penv.cwd, 'y'));
    expect(
      h.run('launch', '--bg', 'a', '--plugin-dir', 'x', '--plugin-dir', 'y'),
    ).toBe(1);
    expect(h.err[0]).toBe(
      '--plugin-dir given more than once: launch takes one plugin folder',
    );
    expect(h.err[1]).toStartWith('usage:');
    expect(h.runner.calls).toEqual([]);
  });
  test('argv writes each profile --plugin-dir after --add-dir, in manifest order', () => {
    const h = harness();
    const dir = mkProfile(h.store, 'a', {
      description: 'A',
      pluginDirs: ['one', 'two'],
    });
    fs.mkdirSync(path.join(dir, 'one'));
    fs.mkdirSync(path.join(dir, 'two'));
    expect(h.run('argv', 'a')).toBe(0);
    const args = h.written.join('').split('\0').slice(0, 6);
    expect(args).toEqual([
      '--add-dir',
      dir,
      '--plugin-dir',
      path.join(dir, 'one'),
      '--plugin-dir',
      path.join(dir, 'two'),
    ]);
  });
  test('a missing pluginDirs entry refuses argv and launch, naming the manifest', () => {
    const h = harness();
    const dir = mkProfile(h.store, 'a', {
      description: 'A',
      pluginDirs: ['plugin'],
    });
    const message = `${path.join(dir, 'profile.json')}: pluginDirs: ${path.join(dir, 'plugin')} is not a folder`;
    expect(h.run('argv', 'a')).toBe(1);
    expect(h.err).toContain(message);
    expect(h.written).toEqual([]);
    expect(h.run('launch', '--bg', 'a')).toBe(1);
    expect(h.runner.calls).toEqual([]);
  });
  test('a key in a role plugin refuses argv, naming the file and the id', () => {
    const h = harness();
    const dir = mkProfile(h.store, 'a', {
      description: 'A',
      pluginDirs: ['plugin'],
    });
    fs.mkdirSync(path.join(dir, 'plugin'));
    const file = path.join(dir, 'plugin', 'k.md');
    const key = `${'ghp'}${'_'}${'a1'.repeat(18)}`;
    fs.writeFileSync(file, `token ${key}`);
    expect(h.run('argv', 'a')).toBe(1);
    expect(h.err).toContain(
      `${file}: the key check flags it (github-classic-pat); keep keys out of a role's plugin`,
    );
    expect(h.err.join('\n')).not.toContain(key);
    expect(h.written).toEqual([]);
  });
  test('show prints the resolved pluginDirs', () => {
    const h = harness();
    const dir = mkProfile(h.store, 'a', {
      description: 'A',
      pluginDirs: ['plugin'],
    });
    fs.mkdirSync(path.join(dir, 'plugin'));
    expect(h.run('show', 'a')).toBe(0);
    expect(h.out).toContain(`  ${path.join(dir, 'plugin')}`);
  });
  describe('a clean room loads sidekick and runs no updates', () => {
    const sidekickPlugin = path.resolve(import.meta.dir, '..', '..', 'plugin');
    const cleanRoom = { description: 'A', settingSources: ['project'] };
    const cleanHarness = () =>
      harness({
        env: {
          SIDEKICK_PROFILES_DIR: tmp(),
          SIDEKICK_PROFILE_SKIP_PLUGIN_CHECK: '1',
        },
      });
    const settingsIn = (args: string[]) =>
      JSON.parse(args[args.indexOf('--settings') + 1]);
    const prepared = (h: ReturnType<typeof harness>) => {
      const store = h.penv.env.SIDEKICK_PROFILES_DIR ?? '';
      mkProfile(store, 'a', cleanRoom);
    };

    test('argv writes the enables and the variable', () => {
      const h = cleanHarness();
      prepared(h);
      expect(h.run('argv', 'a')).toBe(0);
      const s = settingsIn(h.written.join('').split('\0'));
      expect(s.enabledPlugins).toEqual({
        [SIDEKICK_ID]: true,
        ...Object.fromEntries(SIDEKICK_DEPENDENCY_IDS.map((id) => [id, true])),
      });
      expect(s.env.DISABLE_AUTOUPDATER).toBe('1');
    });

    // Launch's own overlay sets the variable for every profile, so the clean
    // room's comes from argv's settings, which carry no overlay.
    test('launch --bg passes what argv composes, and no sidekick key with this repo plugin as --plugin-dir', () => {
      const h = cleanHarness();
      prepared(h);
      expect(h.run('argv', 'a')).toBe(0);
      const fromArgv = settingsIn(h.written.join('').split('\0'));
      expect(fromArgv).toMatchObject({ env: { DISABLE_AUTOUPDATER: '1' } });
      expect(h.run('launch', '--bg', 'a')).toBe(0);
      const plain = settingsIn(h.runner.calls.at(-1)?.args ?? []);
      expect(plain).toMatchObject(fromArgv);
      expect(plain.enabledPlugins[SIDEKICK_ID]).toBe(true);
      expect(h.run('launch', '--bg', 'a', '--plugin-dir', sidekickPlugin)).toBe(
        0,
      );
      const inline = settingsIn(h.runner.calls.at(-1)?.args ?? []);
      expect(inline.enabledPlugins).not.toHaveProperty(SIDEKICK_ID);
      for (const id of SIDEKICK_DEPENDENCY_IDS) {
        expect(inline.enabledPlugins[id]).toBe(true);
      }
    });

    test('a profile plugin dir that is sidekick also makes it inline', () => {
      const h = cleanHarness();
      const store = h.penv.env.SIDEKICK_PROFILES_DIR ?? '';
      mkProfile(store, 'a', { ...cleanRoom, pluginDirs: [sidekickPlugin] });
      expect(h.run('argv', 'a')).toBe(0);
      const s = settingsIn(h.written.join('').split('\0'));
      expect(s.enabledPlugins).not.toHaveProperty(SIDEKICK_ID);
    });
  });
  test('launchTimeoutMs bounds the launch, and only the launch', () => {
    const h = harness({ launchTimeoutMs: 5_000 });
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('launch', '--bg', 'a')).toBe(0);
    expect(h.runner.calls.map((c) => c.opts.timeoutMs)).toEqual([
      30_000, 5_000,
    ]);
  });
  test('a single quoted prompt passes through unchanged', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    h.run('launch', '--bg', 'a', '--', 'fix  the   tests');
    expect(h.runner.calls.at(-1)?.args.slice(-2)).toEqual([
      '--',
      'fix  the   tests',
    ]);
  });
  test('returns the runner code and relays its output', () => {
    const rr = fakeRunner(ok({ code: 3, stdout: 'job 1\n', stderr: 'warn\n' }));
    const h = harness({ runClaude: rr.run });
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('launch', '--bg', 'a')).toBe(3);
    expect(h.out).toEqual(['job 1']);
    expect(h.err).toEqual(['warn']);
  });
  test('a launch that times out says so and returns the runner code', () => {
    const rr = fakeRunner(ok({ code: 143, timedOut: true }));
    const h = harness({ runClaude: rr.run });
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('launch', '--bg', 'a')).toBe(143);
    expect(h.err).toContain('claude did not return in time.');
  });
  test('a refused check never launches', () => {
    const h = harness({ runClaude: () => ok({ stdout: 'nothing\n' }) });
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('launch', '--bg', 'a')).toBe(1);
  });
  describe('records the main', () => {
    const SESSION = 'abcdef0123456789';
    const inSession = (extra: Record<string, string> = {}, agents = '[]') => {
      const config = tmp();
      fs.mkdirSync(path.join(config, 'sessions'));
      fs.writeFileSync(
        path.join(config, 'sessions', '1.json'),
        JSON.stringify({ sessionId: SESSION, nameSource: 'derived' }),
      );
      const base = fakeRunner();
      const h = harness({
        runClaude: (args, opts) =>
          args[0] === 'agents' ? ok({ stdout: agents }) : base.run(args, opts),
      });
      h.penv.env = {
        SIDEKICK_PROFILES_DIR: h.store,
        CLAUDE_CONFIG_DIR: config,
        CLAUDE_CODE_SESSION_ID: SESSION,
        ...extra,
      };
      mkProfile(h.store, 'a', { description: 'A' });
      return h;
    };
    const settingsOf = (args: string[]) =>
      JSON.parse(args[args.indexOf('--settings') + 1]);

    test('the listed name goes whole into the settings, and the line carries the suffix', () => {
      const h = inSession(
        {},
        JSON.stringify([{ name: 'Single word reply', sessionId: SESSION }]),
      );
      const seen: string[][] = [];
      const inner = h.penv.runClaude;
      h.penv.runClaude = (args, opts) => {
        seen.push(args);
        return inner(args, opts);
      };
      expect(h.run('launch', '--bg', 'a')).toBe(0);
      expect(settingsOf(seen.at(-1) ?? []).env).toEqual({
        DISABLE_AUTOUPDATER: '1',
        SIDEKICK_MAIN: 'Single word reply',
      });
      expect(h.out).toEqual([
        'main: Single word reply · sidekick holds this name once this session is idle; ← before then loses it',
      ]);
    });
    test('a listing that fails falls back to the id prefix', () => {
      const h = inSession({}, 'not json');
      expect(h.run('launch', '--bg', 'a')).toBe(0);
      expect(h.out[0]).toStartWith('main: abcdef01');
    });
    test('an inherited SIDEKICK_MAIN passes through with no suffix and no listing', () => {
      const h = inSession({ SIDEKICK_MAIN: 'root main' });
      let listed = false;
      const inner = h.penv.runClaude;
      h.penv.runClaude = (args, opts) => {
        if (args[0] === 'agents') listed = true;
        return inner(args, opts);
      };
      expect(h.run('launch', '--bg', 'a')).toBe(0);
      expect(listed).toBe(false);
      expect(h.out).toEqual(['main: root main']);
    });
    test('outside a session it records nothing and prints no main line', () => {
      const h = harness();
      mkProfile(h.store, 'a', { description: 'A' });
      expect(h.run('launch', '--bg', 'a')).toBe(0);
      expect(h.out).toEqual([]);
    });
    test('outside a session the background launch still runs no updates', () => {
      const h = harness();
      mkProfile(h.store, 'a', { description: 'A' });
      expect(h.run('launch', '--bg', 'a')).toBe(0);
      expect(settingsOf(h.runner.calls.at(-1)?.args ?? []).env).toEqual({
        DISABLE_AUTOUPDATER: '1',
      });
    });
    test('argv leaves updates on, since an interactive session is watched', () => {
      const h = harness();
      mkProfile(h.store, 'a', { description: 'A' });
      expect(h.run('argv', 'a')).toBe(0);
      const args = h.written.join('').split('\0');
      expect(JSON.stringify(settingsOf(args))).not.toContain(
        'DISABLE_AUTOUPDATER',
      );
    });
    test('a failed start prints no main line', () => {
      const h = inSession();
      const inner = h.penv.runClaude;
      h.penv.runClaude = (args, opts) =>
        args.includes('--bg') ? ok({ code: 2 }) : inner(args, opts);
      expect(h.run('launch', '--bg', 'a')).toBe(2);
      expect(h.out).toEqual([]);
    });
  });
  test('refuses an unknown flag', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('launch', '--bg', '--detach', 'a')).toBe(1);
    expect(h.runner.calls).toEqual([]);
  });
});

describe('profile alias', () => {
  test('defaults to zsh and adds an alias per profile', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('alias', 'a')).toBe(0);
    const text = h.out.join('\n');
    expect(text).toContain('emulate -L zsh');
    expect(text).toContain("alias a='skp a'");
  });
  test('--shell bash prints the bash form', () => {
    const h = harness();
    expect(h.run('alias', '--shell', 'bash')).toBe(0);
    expect(h.out.join('\n')).not.toContain('emulate -L zsh');
    expect(h.out.join('\n')).toContain('mktemp');
  });
  test('refuses an unknown shell', () => {
    const h = harness();
    expect(h.run('alias', '--shell', 'fish')).toBe(1);
    expect(h.err[0]).toContain('fish');
  });
  test('refuses an invalid name', () => {
    const h = harness();
    expect(h.run('alias', 'x; rm')).toBe(1);
  });
  test('refuses a profile that does not load', () => {
    const h = harness();
    expect(h.run('alias', 'ghost')).toBe(1);
    expect(h.err[0]).toContain('no profile named "ghost"');
  });
  test.each([
    ['skp', 'the skp function itself'],
    ['command', 'runs its commands through command and builtin'],
    ['builtin', 'runs its commands through command and builtin'],
    ...[
      'case',
      'coproc',
      'declare',
      'do',
      'done',
      'elif',
      'else',
      'end',
      'esac',
      'export',
      'fi',
      'float',
      'for',
      'foreach',
      'function',
      'if',
      'in',
      'integer',
      'local',
      'nocorrect',
      'readonly',
      'repeat',
      'select',
      'then',
      'time',
      'typeset',
      'until',
      'while',
    ].map((word) => [word, 'a reserved word in zsh or bash']),
  ])('refuses %s as an alias name and says why', (name, why) => {
    const h = harness();
    mkProfile(h.store, name, { description: 'X' });
    expect(h.run('alias', name)).toBe(1);
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toContain(`"${name}"`);
    expect(h.err[0]).toContain(why);
    expect(h.out).toEqual([]);
  });
  test('takes a name that only contains a refused word', () => {
    const h = harness();
    mkProfile(h.store, 'do-it', { description: 'X' });
    expect(h.run('alias', 'do-it')).toBe(0);
    expect(h.out.join('\n')).toContain("alias do-it='skp do-it'");
  });
});

// The shells a printed line is pasted into, reading it as typed. A default
// interactive zsh leaves `interactivecomments` off, so a `#` there is a word.
const AS_TYPED = { sh: ['-s'], zsh: ['-f', '-i'] } as const;

// Runs one pasted line after a `skp` stub that prints its folder, then each
// argument on a line. The shell starts in a session of its own: an interactive
// zsh holding the test's terminal stops the runner. A shell still running at
// `timeoutMs` is killed with its process group.
function runAsTyped(
  shell: keyof typeof AS_TYPED,
  line: string,
  cwd: string,
  timeoutMs = 4_000,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(shell, [...AS_TYPED[shell]], {
      cwd,
      detached: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const timer = setTimeout(() => {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      reject(new Error(`${shell} did not exit within ${timeoutMs} ms`));
    }, timeoutMs);
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(stdout.split('\n').slice(0, -1));
    });
    child.stdin.end(`skp() { pwd -P; printf '%s\\n' "$@"; }\n${line}\n`);
  });
}

describe('profile switch', () => {
  const withSession = (h: ReturnType<typeof harness>, id?: string) => {
    h.penv.env = { ...h.penv.env, CLAUDE_CODE_SESSION_ID: id };
  };
  test('takes the id from CLAUDE_CODE_SESSION_ID and prints the relaunch lines', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    withSession(h, 'sess-1');
    expect(h.run('switch', 'a')).toBe(0);
    const cd = `cd '${h.penv.cwd}'`;
    expect(h.out).toEqual([
      'To switch this session to "a", type /exit, then run one of these.',
      'Keep the conversation:',
      `  ${cd} && skp a --resume 'sess-1'`,
      'Start fresh:',
      `  ${cd} && skp a`,
      'After a resume, skills of plugins "a" turns off stay listed but fail when called.',
    ]);
  });
  test('--session wins over CLAUDE_CODE_SESSION_ID', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    withSession(h, 'from-env');
    expect(h.run('switch', 'a', '--session', 'from-flag')).toBe(0);
    expect(h.out.join('\n')).toContain("--resume 'from-flag'");
    expect(h.out.join('\n')).not.toContain('from-env');
  });
  test('an empty --session refuses, saying so, while CLAUDE_CODE_SESSION_ID is set', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    withSession(h, 'from-env');
    for (const flag of [['--session', ''], ['--session=']]) {
      h.err.length = 0;
      expect(h.run('switch', 'a', ...flag)).toBe(1);
      expect(h.err).toEqual([
        '--session is empty: pass a session id, or leave the flag out inside a session',
      ]);
    }
    expect(h.out).toEqual([]);
  });
  test('an empty CLAUDE_CODE_SESSION_ID with no --session refuses', () => {
    const h = harness();
    mkProfile(h.store, 'a', { description: 'A' });
    withSession(h, '');
    expect(h.run('switch', 'a')).toBe(1);
    expect(h.err.join('\n')).toContain('no session id');
    expect(h.out).toEqual([]);
  });
  test('a refused check prints no relaunch lines and returns 1', () => {
    const h = harness({ runClaude: () => ok({ stdout: 'no report' }) });
    mkProfile(h.store, 'a', { description: 'A' });
    withSession(h, 's');
    expect(h.run('switch', 'a')).toBe(1);
    expect(h.out).toEqual([]);
    expect(h.err.join('\n')).toContain('no longer parses');
  });
  test('each command line runs whole in sh and in an interactive zsh, landing in the folder with exactly its words', async () => {
    const folder = path.join(tmp(), "it's a folder");
    fs.mkdirSync(folder);
    const h = harness({ cwd: folder });
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('switch', 'a', '--session', "i'd")).toBe(0);
    const [resume, fresh] = h.out.filter((line) => line.startsWith('  '));
    const here = fs.realpathSync(folder);
    for (const shell of ['sh', 'zsh'] as const) {
      expect(await runAsTyped(shell, resume, tmp())).toEqual([
        here,
        'a',
        '--resume',
        "i'd",
      ]);
      expect(await runAsTyped(shell, fresh, tmp())).toEqual([here, 'a']);
    }
  });
  test('inside a work tree, both lines cd to its top, not to the subfolder switch ran in', () => {
    const h = repoHarness();
    mkProfile(h.repoStore, 'review', { description: 'R' });
    h.penv.cwd = path.join(h.workTree, 'bin', 'helpers');
    fs.mkdirSync(h.penv.cwd, { recursive: true });
    withSession(h, 's');
    expect(h.run('switch', 'review')).toBe(0);
    const lines = h.out.filter((line) => line.startsWith('  '));
    expect(lines).toEqual([
      `  cd '${h.workTree}' && skp review --resume 's'`,
      `  cd '${h.workTree}' && skp review`,
    ]);
  });
  test('a repo profile prints the provenance line on err', () => {
    const h = repoHarness();
    const dir = mkProfile(h.repoStore, 'review', { description: 'R' });
    withSession(h, 's');
    expect(h.run('switch', 'review')).toBe(0);
    expect(h.err).toEqual([
      `profile "review" comes from the repo store: ${dir}`,
    ]);
  });
  test('an unknown flag and a missing name print the usage', () => {
    const h = harness();
    withSession(h, 's');
    expect(h.run('switch', 'a', '--bogus')).toBe(1);
    expect(h.run('switch')).toBe(1);
    expect(h.err.filter((l) => l.startsWith('usage: '))).toHaveLength(2);
  });
});

describe('profile dispatch', () => {
  test('an unknown verb gives the usage and returns 1', () => {
    const h = harness();
    expect(h.run('frobnicate')).toBe(1);
    expect(h.err[0]).toContain('usage: sidekick profile');
  });
  test('no verb gives the usage', () => {
    const h = harness();
    expect(h.run()).toBe(1);
  });
  test('an inherited property name is not a verb', () => {
    const h = harness();
    expect(h.run('constructor')).toBe(1);
  });
});

// A repo store and a user store side by side; `SIDEKICK_PROFILES_DIR` stays unset.
function repoHarness() {
  const workTree = tmp();
  const home = tmp();
  const repoStore = path.join(workTree, '.claude', 'profiles');
  const userStore = path.join(home, '.claude', 'sidekick', 'profiles');
  const h = harness({
    env: {},
    home,
    workTree: { kind: 'inside', top: workTree },
    cwd: workTree,
  });
  return { ...h, workTree, repoStore, userStore };
}

describe('the repo store', () => {
  test('argv prints the provenance line on err and keeps stdout to the NUL-terminated arguments', () => {
    const h = repoHarness();
    const dir = mkProfile(h.repoStore, 'review', { description: 'R' });
    expect(h.run('argv', 'review')).toBe(0);
    expect(h.err).toEqual([
      `profile "review" comes from the repo store: ${dir}`,
    ]);
    expect(h.out).toEqual([]);
    const words = h.written.join('').split('\0');
    expect(words.pop()).toBe('');
    expect(words).toContain(dir);
    expect(h.written.join('')).not.toContain('comes from');
  });
  test('a user-store profile prints no provenance line', () => {
    const h = repoHarness();
    mkProfile(h.userStore, 'review', { description: 'U' });
    expect(h.run('argv', 'review')).toBe(0);
    expect(h.err).toEqual([]);
  });
  test('the line names the user profile a repo profile shadows', () => {
    const h = repoHarness();
    const repoDir = mkProfile(h.repoStore, 'review', { description: 'R' });
    const userDir = mkProfile(h.userStore, 'review', { description: 'U' });
    expect(h.run('argv', 'review')).toBe(0);
    expect(h.err).toEqual([
      `profile "review" comes from the repo store: ${repoDir} (it shadows ${userDir})`,
    ]);
  });
  test('launch prints the provenance line too', () => {
    const h = repoHarness();
    const dir = mkProfile(h.repoStore, 'review', { description: 'R' });
    expect(h.run('launch', '--bg', 'review')).toBe(0);
    expect(h.err).toEqual([
      `profile "review" comes from the repo store: ${dir}`,
    ]);
  });
  test('argv prints the provenance line even when the check refuses', () => {
    const h = repoHarness();
    const dir = mkProfile(h.repoStore, 'review', {
      description: 'R',
      settings: { feedbackSurveyRate: 'x' },
    });
    h.penv.runClaude = () => ok({ stdout: 'no canary here' });
    expect(h.run('argv', 'review')).toBe(1);
    expect(h.err[0]).toBe(`profile "review" comes from the repo store: ${dir}`);
    expect(h.err.length).toBeGreaterThan(1);
  });
  test('list marks each store and the shadowed user profile', () => {
    const h = repoHarness();
    const repoDir = mkProfile(h.repoStore, 'review', { description: 'Stance' });
    mkProfile(h.userStore, 'review', { description: 'Stance' });
    mkProfile(h.userStore, 'other', { description: 'Other' });
    expect(h.run('list')).toBe(0);
    expect(h.out).toEqual([
      `review  Stance  (repo: ${h.repoStore})`,
      `other  Other  (user: ${h.userStore})`,
      `review  Stance  (user: ${h.userStore}, shadowed by ${repoDir})`,
    ]);
  });
  test('show prints the store beside the folder', () => {
    const h = repoHarness();
    const dir = mkProfile(h.repoStore, 'review', { description: 'R' });
    expect(h.run('show', 'review')).toBe(0);
    expect(h.out.slice(0, 2)).toEqual([`folder: ${dir}`, 'store: repo']);
  });
  test('new writes to the user store, inside a work tree too', () => {
    const h = repoHarness();
    expect(h.run('new', 'fresh', '--description', 'F')).toBe(0);
    expect(h.out).toEqual([path.join(h.userStore, 'fresh')]);
    expect(fs.existsSync(path.join(h.repoStore, 'fresh'))).toBe(false);
  });
  test('new --repo writes to the repo store', () => {
    const h = repoHarness();
    expect(h.run('new', 'fresh', '--description', 'F', '--repo')).toBe(0);
    expect(h.out).toEqual([path.join(h.repoStore, 'fresh')]);
    expect(fs.existsSync(path.join(h.userStore, 'fresh'))).toBe(false);
  });
  test('new --repo refuses outside a work tree, saying why', () => {
    const h = repoHarness();
    h.penv.workTree = { kind: 'outside' };
    expect(h.run('new', 'fresh', '--description', 'F', '--repo')).toBe(1);
    expect(h.err).toEqual([
      'not inside a git work tree, so there is no repo store',
    ]);
  });
  test("new --repo refuses where git rev-parse failed for another reason, quoting git's line", () => {
    const h = repoHarness();
    h.penv.workTree = {
      kind: 'failed',
      issue: 'fatal: invalid gitfile format: /x/.git',
    };
    expect(h.run('new', 'fresh', '--description', 'F', '--repo')).toBe(1);
    expect(h.err).toEqual([
      `git rev-parse failed in ${h.penv.cwd}, so there is no repo store: fatal: invalid gitfile format: /x/.git; fix what git reports, then run the command again`,
    ]);
  });
  test('new --repo refuses where the repo store is the user store, saying why', () => {
    const h = repoHarness();
    h.penv.home = h.workTree;
    fs.mkdirSync(path.join(h.workTree, '.claude', 'sidekick', 'profiles'), {
      recursive: true,
    });
    fs.symlinkSync(
      path.join(h.workTree, '.claude', 'sidekick', 'profiles'),
      h.repoStore,
    );
    expect(h.run('new', 'fresh', '--description', 'F', '--repo')).toBe(1);
    expect(h.err).toEqual([
      'the repo store is the user store here, so --repo has nowhere else to write',
    ]);
    expect(fs.existsSync(path.join(h.repoStore, 'fresh'))).toBe(false);
  });
  test('new --repo refuses while SIDEKICK_PROFILES_DIR is set, saying why', () => {
    const h = repoHarness();
    h.penv.env = { SIDEKICK_PROFILES_DIR: h.userStore };
    expect(h.run('new', 'fresh', '--description', 'F', '--repo')).toBe(1);
    expect(h.err).toEqual([
      'SIDEKICK_PROFILES_DIR is set, so there is no repo store',
    ]);
  });
});

describe('the old profile store refuses every verb that reads or writes a store', () => {
  // A temp HOME whose old store holds `worker`, and no SIDEKICK_PROFILES_DIR.
  function oldStoreHarness() {
    const home = tmp();
    mkProfile(path.join(home, '.claude', 'profiles'), 'worker', {
      description: 'W',
    });
    const h = harness({ env: {}, home, cwd: home });
    return { ...h, home };
  }

  const verbs: string[][] = [
    ['list'],
    ['show', 'worker'],
    ['argv', 'worker'],
    ['launch', '--bg', 'worker'],
    ['switch', 'worker', '--session', 's1'],
    ['new', 'x', '--description', 'd'],
  ];

  for (const verb of verbs) {
    test(`${verb[0]} exits 1 and prints the move`, () => {
      const h = oldStoreHarness();
      expect(h.run(...verb)).toBe(1);
      const fresh = path.join(h.home, '.claude', 'sidekick', 'profiles');
      expect(h.err[0]).toContain('worker');
      expect(h.err[1]).toBe(
        `mkdir -p '${path.dirname(fresh)}' && mv '${path.join(h.home, '.claude', 'profiles')}' '${fresh}'`,
      );
      expect(h.out).toEqual([]);
      expect(h.runner.calls).toEqual([]);
      expect(fs.existsSync(path.join(h.home, '.claude', 'sidekick'))).toBe(
        false,
      );
    });
  }

  test('alias prints the refusal once for several names, and reads no store without one', () => {
    const h = oldStoreHarness();
    expect(h.run('alias', 'worker', 'other')).toBe(1);
    expect(h.err).toHaveLength(2);
    expect(h.err[0]).toContain('worker');
    expect(h.err[1]).toStartWith('mkdir -p ');
    expect(h.out).toEqual([]);
    const bare = oldStoreHarness();
    expect(bare.run('alias')).toBe(0);
    expect(bare.err).toEqual([]);
  });

  test('alias gives each refused name its line, then the old store refusal once, and reads no store for refused names alone', () => {
    const h = oldStoreHarness();
    expect(h.run('alias', 'skp', 'worker', 'do', 'other')).toBe(1);
    expect(h.err).toHaveLength(4);
    expect(h.err[0]).toStartWith('"skp" cannot be an alias');
    expect(h.err[1]).toStartWith('"do" cannot be an alias');
    expect(h.err[2]).toContain('the old store');
    expect(h.err[3]).toStartWith('mkdir -p ');
    const refusedOnly = oldStoreHarness();
    expect(refusedOnly.run('alias', 'skp')).toBe(1);
    expect(refusedOnly.err).toHaveLength(1);
    expect(refusedOnly.err[0]).toStartWith('"skp" cannot be an alias');
  });

  test('the printed lines, then the bridge link as profiles.md gives it, leave list passing with no self-link', () => {
    const home = path.join(tmp(), "it's home");
    const config = path.join(home, '.claude');
    const old = path.join(config, 'profiles');
    const fresh = path.join(config, 'sidekick', 'profiles');
    mkProfile(old, 'worker', { description: 'W' });
    mkProfile(fresh, 'other', { description: 'O' });
    const refused = harness({ env: {}, home, cwd: home });
    expect(refused.run('list')).toBe(1);
    const sh = (script: string) =>
      spawnSync('sh', ['-c', script], {
        env: { PATH: process.env.PATH, HOME: home },
        encoding: 'utf-8',
      });
    for (const line of refused.err.slice(1)) {
      expect(sh(line).status).toBe(0);
    }
    const doc = fs.readFileSync(
      path.join(
        import.meta.dir,
        '..',
        '..',
        'plugin/skills/sidekick/references/profiles.md',
      ),
      'utf-8',
    );
    const bridgeLines = doc
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('ln -s '));
    expect(bridgeLines).toHaveLength(1);
    const bridge = sh(bridgeLines[0]);
    expect(bridge.stderr).toBe('');
    expect(bridge.status).toBe(0);
    const after = harness({ env: {}, home, cwd: home });
    expect(after.run('list')).toBe(0);
    expect(after.out).toEqual([
      `other  O  (user: ${fresh})`,
      `worker  W  (user: ${fresh})`,
    ]);
    expect(fs.readlinkSync(old)).toBe(fresh);
    expect(fs.readdirSync(fresh).sort()).toEqual(['other', 'worker']);
  });

  test('a work tree topped at HOME, as a dotfiles repo is, refuses the same way', () => {
    const home = tmp();
    mkProfile(path.join(home, '.claude', 'profiles'), 'worker', {
      description: 'W',
    });
    const h = harness({
      env: {},
      home,
      cwd: home,
      workTree: { kind: 'inside', top: home },
    });
    expect(h.run('list')).toBe(1);
    expect(h.err[0]).toContain('worker');
    expect(h.err).toHaveLength(2);
  });

  test('an old store that is a relative link: the printed line, run through sh, lets list show the profile', () => {
    const home = path.join(tmp(), "it's home");
    mkProfile(path.join(home, 'dotfiles', 'profiles'), 'worker', {
      description: 'W',
    });
    fs.mkdirSync(path.join(home, '.claude'));
    const old = path.join(home, '.claude', 'profiles');
    fs.symlinkSync(path.join('..', 'dotfiles', 'profiles'), old);
    const refused = harness({ env: {}, home, cwd: home });
    expect(refused.run('list')).toBe(1);
    const shell = spawnSync('sh', ['-c', refused.err[1]], {
      env: { PATH: process.env.PATH, HOME: home },
      encoding: 'utf-8',
    });
    expect(shell.stderr).toBe('');
    expect(shell.status).toBe(0);
    expect(fs.existsSync(old)).toBe(false);
    const after = harness({ env: {}, home, cwd: home });
    expect(after.run('list')).toBe(0);
    expect(after.err).toEqual([]);
    expect(after.out.join('\n')).toContain('worker');
  });

  test('a refused name makes no sidekick repo', () => {
    const home = tmp();
    const h = harness({ env: {}, home, cwd: home });
    expect(h.run('new', 'BAD', '--description', 'd')).toBe(1);
    expect(h.err[0]).toContain('is not a profile name');
    expect(fs.existsSync(path.join(home, '.claude', 'sidekick', '.git'))).toBe(
      false,
    );
  });
});

describe('profile new --repo where the repo store is the old user store path', () => {
  const oneLine = (h: { err: string[] }): string => h.err.join('\n');

  test('a dotfiles repo at HOME refuses and writes nothing', () => {
    const home = tmp();
    const h = harness({
      env: {},
      home,
      cwd: home,
      workTree: { kind: 'inside', top: home },
    });
    expect(h.run('new', 'x', '--description', 'd', '--repo')).toBe(1);
    const old = path.join(home, '.claude', 'profiles');
    expect(h.err).toEqual([
      `The repo store here, ${old}, is the old user store's path, and every profile verb that reads or writes a store refuses while that folder holds a profile. Run new without --repo to write to ${path.join(home, '.claude', 'sidekick', 'profiles')}.`,
    ]);
    expect(fs.existsSync(path.join(old, 'x'))).toBe(false);
    expect(h.out).toEqual([]);
  });

  test('prints both paths in the config spelling when git gives the resolved one', () => {
    const real = tmp();
    fs.mkdirSync(path.join(real, '.claude', 'profiles'), { recursive: true });
    const home = path.join(tmp(), 'home-link');
    fs.symlinkSync(real, home);
    const h = harness({
      env: {},
      home,
      cwd: home,
      workTree: { kind: 'inside', top: fs.realpathSync(real) },
    });
    expect(h.run('new', 'x', '--description', 'd', '--repo')).toBe(1);
    expect(h.err).toEqual([
      `The repo store here, ${path.join(home, '.claude', 'profiles')}, is the old user store's path, and every profile verb that reads or writes a store refuses while that folder holds a profile. Run new without --repo to write to ${path.join(home, '.claude', 'sidekick', 'profiles')}.`,
    ]);
  });

  test('a HOME reached through a link, with no old store yet, refuses the same way', () => {
    const real = tmp();
    expect(execRunner('git', ['init', '-q'], real).code).toBe(0);
    const home = path.join(tmp(), 'home-link');
    fs.symlinkSync(real, home);
    const workTree = workTreeRootOf(home);
    expect(workTree).toEqual({ kind: 'inside', top: fs.realpathSync(real) });
    const h = harness({ env: {}, home, cwd: home, workTree });
    expect(h.run('new', 'x', '--description', 'd', '--repo')).toBe(1);
    expect(oneLine(h)).toContain("is the old user store's path");
    expect(fs.existsSync(path.join(real, '.claude', 'profiles'))).toBe(false);
  });

  test('CLAUDE_CONFIG_DIR set to the repo .claude refuses the same way', () => {
    const repo = tmp();
    const home = tmp();
    const h = harness({
      env: { CLAUDE_CONFIG_DIR: path.join(repo, '.claude') },
      home,
      cwd: repo,
      workTree: { kind: 'inside', top: repo },
    });
    expect(h.run('new', 'x', '--description', 'd', '--repo')).toBe(1);
    expect(oneLine(h)).toContain("is the old user store's path");
    expect(fs.existsSync(path.join(repo, '.claude', 'profiles', 'x'))).toBe(
      false,
    );
  });

  test('the bridged case still reaches the no-repo-store message', () => {
    const home = tmp();
    const fresh = path.join(home, '.claude', 'sidekick', 'profiles');
    fs.mkdirSync(fresh, { recursive: true });
    fs.symlinkSync(fresh, path.join(home, '.claude', 'profiles'));
    const h = harness({
      env: {},
      home,
      cwd: home,
      workTree: { kind: 'inside', top: home },
    });
    expect(h.run('new', 'x', '--description', 'd', '--repo')).toBe(1);
    expect(oneLine(h)).toContain('the repo store is the user store here');
  });
});
