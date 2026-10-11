import { afterEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkAdrIndex,
  checkDesignStatus,
  checkPermalinks,
  checkResearchIndexes,
  checkRootAbsoluteLinks,
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

  it('resolves a root-absolute URL against the repo root', () => {
    expect(targetOf('docs/a.md', '/docs/superpowers/p.md#x')).toBe(
      'docs/superpowers/p.md',
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

  it('reports a permalink whose owner and repo differ only in case', () => {
    const root = repo({ 'docs/x.md': '# x\n' });
    const sha = head(root);
    write(root, {
      'a.md': `[y](https://github.com/rikmorn/Sidekick/blob/${sha}/docs/y.md)\n`,
    });
    expect(checkPermalinks(root, ['a.md'])).toHaveLength(1);
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

describe('checkRootAbsoluteLinks', () => {
  it('reports a link starting with a single slash, and passes the rest', () => {
    const root = tempDir();
    write(root, {
      'a.md': [
        '[a](/docs/nope.md)',
        '',
        '[b]: /x.md',
        '',
        '[c](//example.com/x) [d](./ok.md) [e](https://example.com/y)',
      ].join('\n'),
    });
    expect(checkRootAbsoluteLinks(root, ['a.md']).map((f) => f.line)).toEqual([
      1, 3,
    ]);
  });
});

describe('checkAdrIndex', () => {
  const adrs = ['docs/adr/0001-one.md', 'docs/adr/0002-two.md'];

  it('passes when the README links every ADR', () => {
    const root = tempDir();
    write(root, {
      'docs/adr/README.md': '[one](./0001-one.md)\n\n[two](0002-two.md#top)\n',
    });
    expect(checkAdrIndex(root, ['docs/adr/README.md', ...adrs])).toEqual([]);
  });

  it('reports an unlisted ADR by its file name', () => {
    const root = tempDir();
    write(root, { 'docs/adr/README.md': '[one](./0001-one.md)\n' });
    const findings = checkAdrIndex(root, ['docs/adr/README.md', ...adrs]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toBe('docs/adr/README.md');
    expect(findings[0]?.message).toContain('0002-two.md');
  });

  it('reports the missing README when ADRs exist', () => {
    const findings = checkAdrIndex(tempDir(), adrs);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('README.md');
  });

  it('passes a repo with no docs/adr/', () => {
    expect(checkAdrIndex(tempDir(), ['README.md'])).toEqual([]);
  });
});

describe('checkResearchIndexes', () => {
  const topic = 'docs/research/topic';

  it('passes a README that links each file, anchors and subfolders included', () => {
    const root = tempDir();
    write(root, {
      [`${topic}/README.md`]: '[r](./REPORT.md#findings)\n\n[s](sub/deep.md)\n',
    });
    const files = [
      `${topic}/README.md`,
      `${topic}/REPORT.md`,
      `${topic}/sub/deep.md`,
    ];
    expect(checkResearchIndexes(root, files)).toEqual([]);
  });

  it('reports an unlinked FRAMING.md', () => {
    const root = tempDir();
    write(root, { [`${topic}/README.md`]: '[r](./REPORT.md)\n' });
    const findings = checkResearchIndexes(root, [
      `${topic}/README.md`,
      `${topic}/REPORT.md`,
      `${topic}/FRAMING.md`,
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('FRAMING.md');
  });

  it('reports a file in a subfolder that the README omits', () => {
    const root = tempDir();
    write(root, { [`${topic}/README.md`]: '# topic\n' });
    const findings = checkResearchIndexes(root, [
      `${topic}/README.md`,
      `${topic}/sub/deep.md`,
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('sub/deep.md');
  });

  it('reports a topic without a README', () => {
    const findings = checkResearchIndexes(tempDir(), [`${topic}/REPORT.md`]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('README.md');
  });

  it("passes the programme's own README alone", () => {
    expect(
      checkResearchIndexes(tempDir(), ['docs/research/README.md']),
    ).toEqual([]);
  });
});

describe('checkDesignStatus', () => {
  const designWith = (status: string): [string, string[]] => {
    const root = tempDir();
    write(root, {
      'docs/designs/t/design.md': `# T\n\n${status}\n\n## Problem\n`,
    });
    return [root, ['docs/designs/t/design.md']];
  };

  it.each([
    'Status: exploring',
    'Status: ready for PM · Scale: shape · 2026-10-10',
    'Status: planned (#193, #105) · Scale: explore · 2026-10-10',
    'Status: planned (#7)',
  ])('passes %s', (status) => {
    const [root, files] = designWith(status);
    expect(checkDesignStatus(root, files)).toEqual([]);
  });

  it('reports an invalid value and names it', () => {
    const [root, files] = designWith('Status: draft');
    const findings = checkDesignStatus(root, files);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('Status: draft');
  });

  it('ignores Status: text in a fenced block before the real line', () => {
    const root = tempDir();
    write(root, {
      'docs/designs/t/design.md': [
        '# T',
        '',
        '```markdown',
        'Status: draft',
        '```',
        '',
        'Status: exploring · Scale: shape',
      ].join('\n'),
    });
    expect(checkDesignStatus(root, ['docs/designs/t/design.md'])).toEqual([]);
  });

  it('reports a design.md without a status line', () => {
    const [root, files] = designWith('No status here.');
    const findings = checkDesignStatus(root, files);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('Status:');
  });

  it('reports a design folder holding only notes.md', () => {
    const findings = checkDesignStatus(tempDir(), ['docs/designs/t/notes.md']);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('design.md');
  });

  it('passes a repo with no docs/designs/', () => {
    expect(checkDesignStatus(tempDir(), ['README.md'])).toEqual([]);
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

  it('fails a fixture repo with one unlisted ADR', () => {
    const root = repo({
      'docs/adr/README.md': '[one](./0001-one.md)\n',
      'docs/adr/0001-one.md': '# One\n',
      'docs/adr/0002-two.md': '# Two\n',
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('0002-two.md');
  });

  it('fails a permalink to a missing path', () => {
    const root = repo({ 'docs/x.md': '# x\n' });
    const sha = head(root);
    write(root, { 'a.md': `[y](${PERMALINK}/${sha}/docs/y.md)\n` });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/y.md');
  });

  it('fails a link into the working folder', () => {
    const root = repo({ 'docs/a.md': '[p](./superpowers/plans/p.md)\n' });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/superpowers');
  });

  it('fails a root-absolute link', () => {
    const root = repo({ 'a.md': '[x](/docs/nope.md)\n' });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('relative');
  });

  it('fails a research file its README does not link', () => {
    const root = repo({
      'docs/research/t/README.md': '# t\n',
      'docs/research/t/FRAMING.md': '# f\n',
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FRAMING.md');
  });

  it('fails a design with an invalid status', () => {
    const root = repo({ 'docs/designs/t/design.md': '# T\n\nStatus: draft\n' });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Status: draft');
  });

  it('passes a repo with no Markdown file', () => {
    const root = repo({ 'a.txt': 'text\n' });
    expect(run(root).status).toBe(0);
  });

  it('exits 2 outside a git repository', () => {
    expect(run(tempDir()).status).toBe(2);
  });
});
