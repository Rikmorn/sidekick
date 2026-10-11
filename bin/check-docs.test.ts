import { afterEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkPermalinks,
  checkWorkingFileLinks,
  linksOf,
  targetOf,
} from './check-docs';

// The docs check catches each planted breach, and passes what the repo's docs legitimately hold.

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-docs.ts',
);
const ORIGIN = 'https://github.com/Rikmorn/sidekick.git';
const PERMALINK = 'https://github.com/Rikmorn/sidekick/blob';

const git = (cwd: string, ...args: string[]) => {
  const run = spawnSync(
    'git',
    ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
    { cwd, encoding: 'utf8' },
  );
  if (run.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`);
  }
  return run.stdout.trim();
};

const write = (root: string, files: Record<string, string>) => {
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
};

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const tempDir = (): string => {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'check-docs-')),
  );
  scratch.push(dir);
  return dir;
};

// A committed fixture repo with a GitHub origin, so remark-validate-links reads it as that repo.
const repo = (files: Record<string, string>): string => {
  const root = tempDir();
  git(root, 'init', '-q');
  git(root, 'remote', 'add', 'origin', ORIGIN);
  write(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'fixture');
  return root;
};

const head = (root: string) => git(root, 'rev-parse', 'HEAD');

const run = (cwd: string) =>
  spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });

describe('linksOf', () => {
  it('returns an inline link, an image, and a definition with their lines', () => {
    const markdown = ['[a](./a.md)', '', '![b](b.png)', '', '[c]: ./c.md'].join(
      '\n',
    );
    expect(linksOf(markdown)).toEqual([
      { url: './a.md', line: 1 },
      { url: 'b.png', line: 3 },
      { url: './c.md', line: 5 },
    ]);
  });

  it('ignores links inside a code span or a fenced block', () => {
    const markdown = ['`[a](./a.md)`', '', '```', '[b](./b.md)', '```'].join(
      '\n',
    );
    expect(linksOf(markdown)).toEqual([]);
  });
});

describe('targetOf', () => {
  it('drops the anchor and resolves against the linking file', () => {
    expect(targetOf('docs/adr/0001.md', '../research/x/README.md#q')).toBe(
      'docs/research/x/README.md',
    );
  });

  it('normalises a ./ prefix and a ..', () => {
    expect(targetOf('docs/a.md', './b.md')).toBe('docs/b.md');
    expect(targetOf('docs/adr/a.md', '../../README.md?plain=1')).toBe(
      'README.md',
    );
  });

  it('is null for a scheme, a same-file anchor, and an empty URL', () => {
    expect(targetOf('a.md', 'https://example.com/x')).toBeNull();
    expect(targetOf('a.md', 'mailto:me@example.com')).toBeNull();
    expect(targetOf('a.md', '#same-file')).toBeNull();
    expect(targetOf('a.md', '')).toBeNull();
  });
});

describe('checkPermalinks', () => {
  it('passes a permalink whose path exists at that commit', () => {
    const root = repo({ 'docs/x.md': '# x\n' });
    const sha = head(root);
    write(root, {
      'a.md': `[x](${PERMALINK}/${sha}/docs/x.md#top)\n`,
    });
    expect(checkPermalinks(root, ['a.md'])).toEqual([]);
  });

  it('reports file:line for a path missing at that commit', () => {
    const root = repo({ 'docs/x.md': '# x\n' });
    const sha = head(root);
    write(root, { 'a.md': `text\n\n[y](${PERMALINK}/${sha}/docs/y.md)\n` });
    const findings = checkPermalinks(root, ['a.md']);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: 'a.md', line: 3 });
  });

  it('ignores another repository and a GitHub issue URL', () => {
    const root = repo({
      'a.md':
        '[o](https://github.com/Rikmorn/other/blob/abc/x.md) [i](https://github.com/Rikmorn/sidekick/issues/105)\n',
    });
    expect(checkPermalinks(root, ['a.md'])).toEqual([]);
  });
});

describe('checkWorkingFileLinks', () => {
  it('reports a relative link, a definition, and a permalink into the working folder', () => {
    const sha = 'a'.repeat(40);
    const root = tempDir();
    write(root, {
      'docs/a.md': [
        '[a](./superpowers/plans/p.md)',
        '',
        '[b]: ./superpowers',
        '',
        `[c](${PERMALINK}/${sha}/docs/superpowers/plans/p.md)`,
      ].join('\n'),
    });
    expect(
      checkWorkingFileLinks(root, ['docs/a.md']).map((f) => f.line),
    ).toEqual([1, 3, 5]);
  });

  it('passes the folder in a code span and a sibling folder', () => {
    const root = tempDir();
    write(root, {
      'docs/a.md':
        'The `docs/superpowers` folder.\n\n[n](./superpowers-notes.md)\n',
    });
    expect(checkWorkingFileLinks(root, ['docs/a.md'])).toEqual([]);
  });
});

describe('bun run check:docs', () => {
  it('passes a permalink and a valid relative link with a heading', () => {
    const root = repo({ 'docs/x.md': '# Top\n\n## Deep dive\n' });
    const sha = head(root);
    write(root, {
      'docs/a.md': `[x](./x.md#deep-dive) [p](${PERMALINK}/${sha}/docs/x.md)\n`,
    });
    git(root, 'add', '-A');
    const result = run(root);
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('fails a missing relative file', () => {
    const root = repo({ 'a.md': '[gone](./gone.md)\n' });
    expect(run(root).status).toBe(1);
  });

  it('fails a missing heading in another file', () => {
    const root = repo({
      'a.md': '[x](./b.md#nope)\n',
      'b.md': '# Present\n',
    });
    expect(run(root).status).toBe(1);
  });

  it('exits 2 on a shallow clone and names fetch-depth: 0', () => {
    const origin = repo({ 'a.md': '# a\n' });
    const clone = path.join(tempDir(), 'clone');
    spawnSync('git', [
      'clone',
      '-q',
      '--depth',
      '1',
      `file://${origin}`,
      clone,
    ]);
    const result = run(clone);
    expect(result.status).toBe(2);
    expect(result.stdout + result.stderr).toContain('fetch-depth: 0');
  });

  it('names a repo-relative path when run from a subdirectory', () => {
    const root = repo({ 'docs/a.md': '[gone](./gone.md)\n' });
    const result = run(path.join(root, 'docs'));
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('docs/a.md');
  });

  it('checks an untracked file, skips an ignored one', () => {
    const root = repo({ '.gitignore': 'ignored.md\n', 'a.md': '# a\n' });
    write(root, { 'ignored.md': '[gone](./gone.md)\n' });
    expect(run(root).status).toBe(0);
    write(root, { 'new.md': '[gone](./gone.md)\n' });
    expect(run(root).status).toBe(1);
  });

  it('skips a tracked file deleted from disk', () => {
    const root = repo({ 'a.md': '# a\n', 'b.md': '[gone](./gone.md)\n' });
    fs.rmSync(path.join(root, 'b.md'));
    expect(run(root).status).toBe(0);
  });

  it('passes a repo with no Markdown file', () => {
    const root = repo({ 'a.txt': 'text\n' });
    expect(run(root).status).toBe(0);
  });

  it('exits 2 outside a git repository', () => {
    expect(run(tempDir()).status).toBe(2);
  });
});
