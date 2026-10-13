import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type ProfileEnv, runProfileCli } from './profile.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';

const tmp = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'sk-profile-cli-'));

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

/** A runner that answers `doctor` with the canary's line and records every call. */
function fakeRunner(launchResult: ClaudeResult = ok()) {
  const calls: Call[] = [];
  const run: ClaudeRunner = (args, opts) => {
    calls.push({ args, opts });
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
  return { run, calls };
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
    write: (c) => written.push(c),
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
    expect(h.out).toEqual([`a  Alpha  (${path.resolve(h.store)})`]);
  });
  test('shows invalid: for a broken profile and returns 1', () => {
    const h = harness();
    mkProfile(h.store, 'bad', { nope: 1 });
    expect(h.run('list')).toBe(1);
    expect(h.out[0]).toContain('bad  invalid:');
  });
});

describe('profile show', () => {
  test('prints folder, manifest, settings, and arguments without running claude', () => {
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
    expect(h.runner.calls).toEqual([]);
  });
  test('refuses an unknown profile', () => {
    const h = harness();
    expect(h.run('show', 'ghost')).toBe(1);
    expect(h.err[0]).toContain('no profile named "ghost"');
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
  test('a refused check never launches', () => {
    const h = harness({ runClaude: () => ok({ stdout: 'nothing\n' }) });
    mkProfile(h.store, 'a', { description: 'A' });
    expect(h.run('launch', '--bg', 'a')).toBe(1);
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
