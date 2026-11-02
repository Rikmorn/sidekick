import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main, USAGE } from '../cli.js';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { MEMORY_USAGE_LINE } from './memory.js';
import { defaultMemoryFolder } from './memory-default.js';
import { writeMarker } from './memory-store.js';

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

describe('memory lint through main()', () => {
  // Two repo folders, each with a MEMORY.md line linking a missing file, and a settings file that fails its schema.
  function lintWorld() {
    const base = tmp();
    const home = tmp();
    const store = path.join(base, 'store');
    for (const name of ['alpha', 'beta']) {
      const folder = path.join(store, name);
      const checkout = path.join(base, 'checkouts', name);
      fs.mkdirSync(folder, { recursive: true });
      fs.mkdirSync(checkout, { recursive: true });
      writeMarker(folder, checkout);
      fs.mkdirSync(path.join(checkout, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(checkout, '.claude', 'settings.local.json'),
        JSON.stringify({ autoMemoryDirectory: folder }),
      );
      fs.writeFileSync(
        path.join(folder, 'MEMORY.md'),
        `# Memory Index\n\n- [gone](gone-${name}.md)\n`,
      );
    }
    fs.writeFileSync(path.join(store, 'settings.json'), '{ nope');
    const env = {
      HOME: home,
      CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
      SIDEKICK_MEMORY_STORE: store,
    };
    return { base, home, store, env };
  }

  const ids = (json: { findings: { id: string }[] }) =>
    json.findings.map((f) => f.id);
  const folders = (json: { findings: { folder: string }[] }) =>
    json.findings.map((f) => f.folder);

  test('prints findings grouped by folder, then a count per id, and exits 0', () => {
    const w = lintWorld();
    const r = run(['lint'], w.env, w.base);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    const text = r.out.join('\n');
    expect(text).toMatch(/alpha\//);
    expect(text).toMatch(/dead-link {2}\S*alpha\/MEMORY\.md:3 {2}\S/);
    expect(text).toMatch(/dead-link {2}\S*beta\/MEMORY\.md:3 {2}\S/);
    expect(text.indexOf('alpha/')).toBeLessThan(text.indexOf('beta/'));
    expect(r.out[r.out.length - 1]).toMatch(/^\S+ {2}\d+$/);
    expect(r.out).toContain('dead-link  2');
  });

  test('--json prints { findings, counts }', () => {
    const w = lintWorld();
    const r = run(['lint', '--json'], w.env, w.base);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out.join('\n'));
    expect(Object.keys(parsed).sort()).toEqual(['counts', 'findings']);
    expect(parsed.counts['dead-link']).toBe(2);
    expect(ids(parsed).filter((id) => id === 'dead-link')).toHaveLength(2);
  });

  test('--folder narrows to that folder plus store-wide findings, and repeats', () => {
    const w = lintWorld();
    const one = JSON.parse(
      run(['lint', '--json', '--folder', 'alpha/'], w.env, w.base).out.join(
        '\n',
      ),
    );
    expect(folders(one)).toContain('alpha');
    expect(folders(one)).not.toContain('beta');
    expect(ids(one)).toContain('settings-invalid');
    const both = JSON.parse(
      run(
        ['lint', '--json', '--folder', 'alpha', '--folder', 'beta'],
        w.env,
        w.base,
      ).out.join('\n'),
    );
    expect(both.counts['dead-link']).toBe(2);
    const none = JSON.parse(
      run(['lint', '--json', '--folder', 'nope'], w.env, w.base).out.join('\n'),
    );
    expect(folders(none).every((f) => f === '')).toBe(true);
    expect(ids(none)).toContain('settings-invalid');
  });

  test('a clean store prints one line saying so and exits 0', () => {
    const base = tmp();
    const store = path.join(base, 'store');
    fs.mkdirSync(store);
    const r = run(
      ['lint'],
      { HOME: tmp(), SIDEKICK_MEMORY_STORE: store },
      base,
    );
    expect(r.code).toBe(0);
    expect(r.out).toEqual(['The store is clean.']);
  });

  test('an unknown flag prints the usage line and exits 1', () => {
    const w = lintWorld();
    const r = run(['lint', '--bogus'], w.env, w.base);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([`usage: ${MEMORY_USAGE_LINE}`]);
  });

  test('a missing store names the path and exits 1', () => {
    const base = tmp();
    const store = path.join(base, 'absent');
    const r = run(
      ['lint'],
      { HOME: tmp(), SIDEKICK_MEMORY_STORE: store },
      base,
    );
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err.join('\n')).toContain(store);
  });

  test('a store path that is a file exits 1', () => {
    const base = tmp();
    const store = path.join(base, 'file');
    fs.writeFileSync(store, 'x');
    const r = run(
      ['lint'],
      { HOME: tmp(), SIDEKICK_MEMORY_STORE: store },
      base,
    );
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err.join('\n')).toContain(store);
  });

  test('a positional argument prints the usage line and exits 1', () => {
    const w = lintWorld();
    const r = run(['lint', 'foo'], w.env, w.base);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([`usage: ${MEMORY_USAGE_LINE}`]);
  });

  test.skipIf(process.getuid?.() === 0)(
    'an unreadable store names the path and exits 1',
    () => {
      const base = tmp();
      const store = path.join(base, 'locked');
      fs.mkdirSync(store);
      fs.chmodSync(store, 0o000);
      try {
        const r = run(
          ['lint'],
          { HOME: tmp(), SIDEKICK_MEMORY_STORE: store },
          base,
        );
        expect(r.code).toBe(1);
        expect(r.out).toEqual([]);
        expect(r.err.join('\n')).toContain(store);
      } finally {
        fs.chmodSync(store, 0o755);
      }
    },
  );

  test('the usage line names the lint verb', () => {
    expect(MEMORY_USAGE_LINE).toContain('sidekick memory lint');
  });
});
