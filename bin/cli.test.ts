import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as v from 'valibot';
import {
  isMainEntrypoint,
  main,
  readVersion,
  resolvePluginDir,
  USAGE,
} from './cli.js';
import { PROFILE_USAGE_LINE } from './helpers/profile.js';
import { WORKER_USAGE_LINE } from './helpers/worker.js';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sk-cli-'));
}
function write(file: string, body: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

describe('resolvePluginDir', () => {
  test('bundled: plugin/bin/sidekick resolves to plugin/', () => {
    const root = tmp();
    write(path.join(root, 'plugin', 'rules', 'sk-a.md'), '# a\n');
    const entry = pathToFileURL(
      path.join(root, 'plugin', 'bin', 'sidekick'),
    ).href;
    expect(resolvePluginDir(entry)).toBe(path.join(root, 'plugin'));
  });
  test('source: bin/cli.ts resolves to plugin/ beside bin/', () => {
    const root = tmp();
    write(path.join(root, 'plugin', 'rules', 'sk-a.md'), '# a\n');
    const entry = pathToFileURL(path.join(root, 'bin', 'cli.ts')).href;
    expect(resolvePluginDir(entry)).toBe(path.join(root, 'plugin'));
  });
});

describe('readVersion', () => {
  test('reads plugin.json version, unknown when absent or malformed', () => {
    const dir = tmp();
    expect(readVersion(dir)).toBe('unknown');
    write(
      path.join(dir, '.claude-plugin', 'plugin.json'),
      '{"name":"x","version":"9.9.9"}',
    );
    expect(readVersion(dir)).toBe('9.9.9');
    write(path.join(dir, '.claude-plugin', 'plugin.json'), '{"name":"x"}');
    expect(readVersion(dir)).toBe('unknown');
    write(path.join(dir, '.claude-plugin', 'plugin.json'), '{"version":9}');
    expect(readVersion(dir)).toBe('unknown');
  });
});

describe('isMainEntrypoint', () => {
  test('true for the same file, false for undefined or another file', () => {
    const here = pathToFileURL(__filename).href;
    expect(isMainEntrypoint(here, __filename)).toBe(true);
    expect(isMainEntrypoint(here, undefined)).toBe(false);
    expect(isMainEntrypoint(here, path.join(os.tmpdir(), 'nope.js'))).toBe(
      false,
    );
  });
});

describe('main', () => {
  test('hook post-skill reads the event through ctx.readStdin', () => {
    const out: string[] = [];
    const code = main(
      ['hook', 'post-skill'],
      {
        env: {},
        cwd: process.cwd(),
        entryFileUrl: pathToFileURL(path.join(__dirname, 'cli.ts')).href,
        readStdin: () =>
          JSON.stringify({
            tool_input: { skill: 'superpowers:brainstorming' },
          }),
      },
      (l) => out.push(l),
      () => {},
    );
    expect(code).toBe(0);
    expect(out.length).toBe(1);
    expect(JSON.parse(out[0]).hookSpecificOutput.hookEventName).toBe(
      'PostToolUse',
    );
  });
  test('hook post-read reads the event through ctx.readStdin', () => {
    const out: string[] = [];
    const code = main(
      ['hook', 'post-read'],
      {
        env: {},
        cwd: process.cwd(),
        entryFileUrl: pathToFileURL(path.join(__dirname, 'cli.ts')).href,
        readStdin: () =>
          JSON.stringify({
            tool_name: 'Read',
            tool_input: {
              file_path:
                '/repo/.superpowers/sdd/plan/review-abc1234..def5678.diff',
            },
          }),
      },
      (l) => out.push(l),
      () => {},
    );
    expect(code).toBe(0);
    expect(out.length).toBe(1);
    expect(JSON.parse(out[0]).hookSpecificOutput.hookEventName).toBe(
      'PostToolUse',
    );
  });
  test('hook post-tool-batch reads the window from ctx.env and the latch from ctx.tmpdir', () => {
    const dir = tmp();
    const transcript = path.join(dir, 't.jsonl');
    write(
      transcript,
      `${JSON.stringify({
        type: 'assistant',
        isSidechain: false,
        message: {
          usage: {
            input_tokens: 2,
            cache_read_input_tokens: 648,
            cache_creation_input_tokens: 0,
          },
        },
      })}\n`,
    );
    const out: string[] = [];
    const code = main(
      ['hook', 'post-tool-batch'],
      {
        env: { CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '1000' },
        tmpdir: dir,
        cwd: process.cwd(),
        entryFileUrl: pathToFileURL(path.join(__dirname, 'cli.ts')).href,
        readStdin: () =>
          JSON.stringify({
            session_id: 'abc',
            transcript_path: transcript,
            tool_calls: [],
          }),
      },
      (l) => out.push(l),
      () => {},
    );
    expect(code).toBe(0);
    expect(out.length).toBe(1);
    expect(JSON.parse(out[0]).hookSpecificOutput.hookEventName).toBe(
      'PostToolBatch',
    );
    expect(fs.existsSync(path.join(dir, 'sidekick-ctx-abc.json'))).toBe(true);
  });
  test('--version prints the manifest version', () => {
    const root = tmp();
    write(path.join(root, 'plugin', 'rules', 'sk-a.md'), '# a\n');
    write(
      path.join(root, 'plugin', '.claude-plugin', 'plugin.json'),
      '{"name":"sidekick","version":"1.2.3"}',
    );
    const out: string[] = [];
    const code = main(
      ['--version'],
      {
        env: {},
        cwd: root,
        entryFileUrl: pathToFileURL(path.join(root, 'bin', 'cli.ts')).href,
      },
      (l) => out.push(l),
      () => {},
    );
    expect(code).toBe(0);
    expect(out).toEqual(['1.2.3']);
  });
  test('an unknown command prints usage on stderr and exits 1', () => {
    const err: string[] = [];
    const code = main(
      ['install'],
      {
        env: {},
        cwd: tmp(),
        entryFileUrl: pathToFileURL(path.join(tmp(), 'bin', 'cli.ts')).href,
      },
      () => {},
      (l) => err.push(l),
    );
    expect(code).toBe(1);
    expect(err).toEqual([USAGE]);
  });
  test('pm with an unknown verb prints the pm usage on stderr and exits 1', () => {
    const err: string[] = [];
    const code = main(
      ['pm', 'nope'],
      {
        env: {},
        cwd: tmp(),
        entryFileUrl: pathToFileURL(path.join(tmp(), 'bin', 'cli.ts')).href,
      },
      () => {},
      (l) => err.push(l),
    );
    expect(code).toBe(1);
    expect(err[0]).toContain('usage: sidekick pm');
  });
  test('rules install --project uses SIDEKICK_RULES_DIR and the cwd; --user honours CLAUDE_CONFIG_DIR', () => {
    const src = tmp();
    write(path.join(src, 'sk-a.md'), '# a\n');
    const cwd = tmp();
    const home = tmp();
    const entry = pathToFileURL(path.join(tmp(), 'bin', 'cli.ts')).href;
    const env = { SIDEKICK_RULES_DIR: src, CLAUDE_CONFIG_DIR: home };
    expect(
      main(
        ['rules', 'install', '--project'],
        { env, cwd, entryFileUrl: entry },
        () => {},
        () => {},
      ),
    ).toBe(0);
    expect(fs.existsSync(path.join(cwd, '.claude', 'rules', 'sk-a.md'))).toBe(
      true,
    );
    expect(
      main(
        ['rules', 'install', '--user'],
        { env, cwd, entryFileUrl: entry },
        () => {},
        () => {},
      ),
    ).toBe(0);
    expect(fs.existsSync(path.join(home, 'rules', 'sk-a.md'))).toBe(true);
  });
});

describe('main: profile', () => {
  const entryFileUrl = pathToFileURL(path.join(__dirname, 'cli.ts')).href;
  const made: string[] = [];
  const madeDir = (): string => {
    const dir = tmp();
    made.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of made.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  test('dispatches profile and honours the raw writer', () => {
    const store = madeDir();
    write(path.join(store, 'a', 'profile.json'), '{"description":"A"}');
    const chunks: string[] = [];
    const code = main(
      ['profile', 'argv', 'a'],
      {
        env: { SIDEKICK_PROFILES_DIR: store, SIDEKICK_PROFILE_SKIP_CHECK: '1' },
        cwd: store,
        entryFileUrl,
        runClaude: () => {
          throw new Error('no claude in tests');
        },
        write: (c) => chunks.push(c),
      },
      () => {},
      () => {},
    );
    expect(code).toBe(0);
    expect(chunks.join('').split('\0')[0]).toBe('--add-dir');
  });
  test('profile list finds the repo store from a subfolder of the work tree', () => {
    const top = fs.realpathSync(madeDir());
    const home = madeDir();
    expect(spawnSync('git', ['init', '-q', top]).status).toBe(0);
    write(
      path.join(top, '.claude', 'profiles', 'review', 'profile.json'),
      '{"description":"R"}',
    );
    const sub = path.join(top, 'a', 'b');
    fs.mkdirSync(sub, { recursive: true });
    const out: string[] = [];
    const code = main(
      ['profile', 'list'],
      {
        env: { HOME: home },
        cwd: sub,
        entryFileUrl,
        runClaude: () => {
          throw new Error('no claude in tests');
        },
      },
      (l) => out.push(l),
      () => {},
    );
    expect(code).toBe(0);
    expect(out).toEqual([
      `review  R  (repo: ${path.join(top, '.claude', 'profiles')})`,
    ]);
  });
  test('an unknown profile verb prints the profile usage', () => {
    const err: string[] = [];
    const code = main(
      ['profile', 'nope'],
      { env: {}, cwd: process.cwd(), entryFileUrl },
      () => {},
      (l) => err.push(l),
    );
    expect(code).toBe(1);
    expect(err[0]).toContain(PROFILE_USAGE_LINE);
  });
  test.each([
    ['show with no name', ['show']],
    ['argv with an extra argument', ['argv', 'a', 'b']],
    ['alias with an unknown flag', ['alias', '--zsh']],
    ['new with no name', ['new', '--description', 'x']],
    ['launch with no name', ['launch', '--bg']],
    ['list with an argument', ['list', 'a']],
  ])('profile %s prints the profile usage and returns 1', (_label, args) => {
    const err: string[] = [];
    const code = main(
      ['profile', ...args],
      {
        env: { SIDEKICK_PROFILES_DIR: madeDir() },
        cwd: madeDir(),
        entryFileUrl,
        runClaude: () => {
          throw new Error('no claude in tests');
        },
      },
      () => {},
      (l) => err.push(l),
    );
    expect(code).toBe(1);
    expect(err).toEqual([`usage: ${PROFILE_USAGE_LINE}`]);
  });
  test('USAGE names the profile family', () => {
    expect(USAGE).toContain(PROFILE_USAGE_LINE);
  });
  test('profile argv through a pipe delivers every byte before exit', () => {
    const store = madeDir();
    const dir = path.join(store, 'a');
    // Over 64 KiB, the size at which a cut-off pipe write loses bytes.
    const settings = { companyAnnouncements: ['x'.repeat(200_000)] };
    write(
      path.join(dir, 'profile.json'),
      JSON.stringify({ description: 'A', settings }),
    );
    // A shell pipe to a reader that starts late: the pipe buffer fills, and an
    // asynchronous write is cut off at exit.
    const r = spawnSync(
      'sh',
      [
        '-c',
        '"$0" "$1" profile argv a | (sleep 0.3; cat)',
        process.execPath,
        path.join(__dirname, 'cli.ts'),
      ],
      {
        encoding: 'buffer',
        maxBuffer: 1 << 24,
        env: {
          ...process.env,
          SIDEKICK_PROFILES_DIR: store,
          SIDEKICK_PROFILE_SKIP_CHECK: '1',
        },
      },
    );
    expect(r.status).toBe(0);
    const composed = JSON.stringify({
      ...settings,
      sidekick: { profile: 'a' },
    });
    expect(r.stdout.toString()).toBe(
      `--add-dir\0${path.resolve(store)}/a\0--settings\0${composed}\0`,
    );
  });
});

describe('main: worker', () => {
  const entryFileUrl = pathToFileURL(path.join(__dirname, 'cli.ts')).href;
  test('USAGE names the worker family', () => {
    expect(USAGE).toContain(WORKER_USAGE_LINE);
  });
  test('worker with no verb prints the worker usage and returns 1', () => {
    const err: string[] = [];
    const code = main(
      ['worker'],
      {
        env: {},
        cwd: process.cwd(),
        entryFileUrl,
        runClaude: () => {
          throw new Error('no claude in tests');
        },
      },
      () => {},
      (l) => err.push(l),
    );
    expect(code).toBe(1);
    expect(err).toEqual([`usage: ${WORKER_USAGE_LINE}`]);
  });
});

describe('entry point', () => {
  test('running the file directly exits 1 with usage on no arguments', () => {
    const r = spawnSync('bun', [path.join(__dirname, 'cli.ts')], {
      encoding: 'utf-8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage: sidekick rules');
  });
});

describe('the built bundle under an up-tree commonjs package.json', () => {
  const bundleDir = path.join(__dirname, '..', 'plugin', 'bin');
  // Node reads "type" from the nearest package.json, as under ~/.claude/.
  function runCopy(keepPackageJson: boolean) {
    const root = tmp();
    write(path.join(root, 'package.json'), '{"type":"commonjs"}\n');
    const bin = path.join(root, 'bin');
    fs.cpSync(bundleDir, bin, { recursive: true });
    if (!keepPackageJson) {
      fs.rmSync(path.join(bin, 'package.json'), { force: true });
    }
    return spawnSync('node', [path.join(bin, 'sidekick')], {
      encoding: 'utf-8',
    });
  }
  test('runs, with its co-located package.json', () => {
    const r = runCopy(true);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage: sidekick rules');
  });
  test('prints nothing without it, so the first case guards the file', () => {
    const r = runCopy(false);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
  });
});

describe('the notices file covers every bundled dependency', () => {
  const repo = path.join(__dirname, '..');
  const Manifest = v.object({ dependencies: v.record(v.string(), v.string()) });
  // The bundle copies each runtime dependency, and its licence travels with the copy.
  test('each dependency has its name, version, and licence text', () => {
    const { dependencies } = v.parse(
      Manifest,
      JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf-8')),
    );
    const notices = fs.readFileSync(
      path.join(repo, 'plugin', 'THIRD-PARTY-NOTICES.txt'),
      'utf-8',
    );
    expect(Object.keys(dependencies).length).toBeGreaterThan(0);
    for (const [name, version] of Object.entries(dependencies)) {
      const dir = path.join(repo, 'node_modules', name);
      const licence = fs
        .readdirSync(dir)
        .find((f) => /^licen[cs]e(\.md|\.txt)?$/i.test(f));
      expect(licence).toBeDefined();
      expect(notices).toContain(`${name} ${version}\n`);
      expect(notices).toContain(
        fs.readFileSync(path.join(dir, String(licence)), 'utf-8').trim(),
      );
    }
  });
});
