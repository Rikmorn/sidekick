import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main, USAGE } from '../cli.js';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { MEMORY_USAGE_LINE } from './memory.js';
import { defaultMemoryFolder } from './memory-default.js';

const IDENTITY = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const [name, value] of Object.entries(IDENTITY)) {
    saved[name] = process.env[name];
    process.env[name] = value;
  }
});
afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  removeTemps();
});

const SETTINGS_REL = path.join('.claude', 'settings.local.json');

function run(argv: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(
    ['memory', ...argv],
    {
      env,
      cwd,
      entryFileUrl: pathToFileURL(path.join(__dirname, '..', 'cli.ts')).href,
      runClaude: () => ({ code: 0, stdout: '[]', stderr: '', timedOut: false }),
    },
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
}

describe('memory family: usage', () => {
  test('USAGE names the memory family', () => {
    expect(USAGE).toContain(MEMORY_USAGE_LINE);
  });
  test.each([
    ['no verb', []],
    ['an unknown verb', ['unlink', 'x']],
    ['a missing repo', ['link']],
    ['an unknown flag', ['link', 'x', '--bogus']],
    ['a flag without its value', ['link', 'x', '--family']],
    ['two repos', ['link', 'x', 'y']],
  ])('%s prints the usage line and exits 1', (_label, argv) => {
    const r = run(argv, {}, process.cwd());
    expect(r.code).toBe(1);
    expect(r.err).toEqual([`usage: ${MEMORY_USAGE_LINE}`]);
  });
});

describe('memory link through main()', () => {
  // A throwaway repo with an ignored settings file, a fake home, and a default memory folder.
  function world() {
    const top = repo();
    fs.appendFileSync(
      path.join(top, '.git', 'info', 'exclude'),
      `${SETTINGS_REL}\n`,
    );
    const home = tmp();
    const configDir = path.join(home, '.claude');
    const memory = defaultMemoryFolder(top, configDir);
    fs.mkdirSync(memory, { recursive: true });
    fs.writeFileSync(path.join(memory, 'MEMORY.md'), '- [n](n.md)\n');
    fs.writeFileSync(path.join(memory, 'n.md'), 'note\n');
    fs.writeFileSync(
      path.join(configDir, '.claude.json'),
      JSON.stringify({ projects: { [top]: {} } }),
    );
    const base = tmp();
    return { top, home, configDir, base };
  }

  test('links a repo into a temporary store, resolving relative paths against ctx.cwd', () => {
    const w = world();
    const env = {
      HOME: w.home,
      CLAUDE_CONFIG_DIR: w.configDir,
      SIDEKICK_MEMORY_STORE: 'store',
    };
    expect(path.resolve(process.cwd())).not.toBe(w.base);
    const r = run(
      ['link', path.relative(w.base, w.top), '--name', 'thing'],
      env,
      w.base,
    );
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    const store = path.join(w.base, 'store');
    const key = JSON.parse(
      fs.readFileSync(path.join(w.top, SETTINGS_REL), 'utf-8'),
    );
    expect(key.autoMemoryDirectory).toBe(path.join(store, 'thing'));
    expect(fs.readFileSync(path.join(store, 'thing', 'n.md'), 'utf-8')).toBe(
      'note\n',
    );
    expect(git(store, 'log', '--format=%s').length).toBeGreaterThan(0);
  });

  test('--dry-run writes nothing', () => {
    const w = world();
    const store = path.join(w.base, 'store');
    const r = run(
      ['link', w.top, '--dry-run'],
      {
        HOME: w.home,
        CLAUDE_CONFIG_DIR: w.configDir,
        SIDEKICK_MEMORY_STORE: store,
      },
      w.base,
    );
    expect(r.code).toBe(0);
    expect(fs.existsSync(store)).toBe(false);
    expect(fs.existsSync(path.join(w.top, SETTINGS_REL))).toBe(false);
  });
});
