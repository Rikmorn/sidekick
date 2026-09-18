import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  isMainEntrypoint,
  main,
  readVersion,
  resolvePluginDir,
  USAGE,
} from './cli.js';

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

describe('entry point', () => {
  test('running the file directly exits 1 with usage on no arguments', () => {
    const r = spawnSync('bun', [path.join(__dirname, 'cli.ts')], {
      encoding: 'utf-8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage: sidekick rules');
  });
});
