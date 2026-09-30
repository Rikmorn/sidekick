import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSection, readSkillDescription, runHookCli } from './hook.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const PLUGIN_DIR = path.join(REPO_ROOT, 'plugin');
const LIVE_SKILL = path.join(PLUGIN_DIR, 'skills', 'sk-design', 'SKILL.md');
const WRAPPER = path.join(PLUGIN_DIR, 'hooks', 'post-skill');

const LEAD =
  'sidekick: before this brainstorm proposes approaches, check whether the change needs a design pass.';

const CLEAN_CODE = path.join(PLUGIN_DIR, 'rules', 'sk-clean-code.md');
const READ_WRAPPER = path.join(PLUGIN_DIR, 'hooks', 'post-read');
const READ_LEAD =
  "sidekick: this file is a superpowers review package, so sidekick's reviewer rules hold for this review alongside superpowers' reviewer instructions.";
const PACKAGE =
  '/repo/.superpowers/sdd/2026-09-30-plan/review-0d8f9e3..a1b2c3d.diff';

/** A review package's text, listing the given changed files as stat lines. */
function pkgContent(...files: string[]): string {
  return [
    '# Review package: 0d8f9e3..a1b2c3d',
    '',
    '## Commits',
    '',
    'a1b2c3d feat: x',
    '',
    '## Files changed',
    '',
    ...files.map((f) => ` ${f} | 4 ++--`),
    ` ${files.length} files changed, 4 insertions(+), 4 deletions(-)`,
    '',
    '## Diff',
    '',
  ].join('\n');
}

function pkgEvent(content: string): string {
  return readEvent(PACKAGE, {
    tool_response: { type: 'text', file: { content } },
  });
}

function readEvent(
  filePath: unknown,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Read',
    tool_input: { file_path: filePath },
    ...extra,
  });
}

function runVerb(verb: string, stdin: string, pluginDir = PLUGIN_DIR) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runHookCli(
    [verb],
    { readStdin: () => stdin, pluginDir },
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
}

function tmpFile(name: string, text: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-hook-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}

function tmpPlugin(rule: string | undefined): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-hook-plugin-'));
  if (rule !== undefined) {
    fs.mkdirSync(path.join(dir, 'rules'));
    fs.writeFileSync(path.join(dir, 'rules', 'sk-clean-code.md'), rule);
  }
  return dir;
}

function fakeNode(): { binDir: string; marker: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-fake-node-'));
  const marker = path.join(binDir, 'node-started');
  fs.writeFileSync(
    path.join(binDir, 'node'),
    `#!/bin/sh\ntouch "${marker}"\n`,
    {
      mode: 0o755,
    },
  );
  return { binDir, marker };
}

function event(skill: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Skill',
    tool_input: { skill },
    ...extra,
  });
}

function run(stdin: string, pluginDir = PLUGIN_DIR) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runHookCli(
    ['post-skill'],
    { readStdin: () => stdin, pluginDir },
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
}

function tmpSkill(frontmatter: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-hook-'));
  const file = path.join(dir, 'SKILL.md');
  fs.writeFileSync(file, frontmatter);
  return file;
}

describe('readSkillDescription', () => {
  test('the live sk-design description is one JSON-compatible quoted line', () => {
    const description = readSkillDescription(LIVE_SKILL);
    expect(typeof description).toBe('string');
    const raw = fs.readFileSync(LIVE_SKILL, 'utf-8');
    expect(raw).toContain(`description: ${JSON.stringify(description)}\n`);
  });

  test('undefined for a missing file, no frontmatter, or an unquoted value', () => {
    expect(readSkillDescription(path.join(os.tmpdir(), 'nope.md'))).toBe(
      undefined,
    );
    expect(readSkillDescription(tmpSkill('# no frontmatter\n'))).toBe(
      undefined,
    );
    expect(
      readSkillDescription(tmpSkill('---\nname: x\ndescription: bare\n---\n')),
    ).toBe(undefined);
  });
});

describe('runHookCli post-skill', () => {
  test('brainstorming adds the lead and the live description', () => {
    const { code, out, err } = run(event('superpowers:brainstorming'));
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.length).toBe(1);
    const parsed = JSON.parse(out[0]);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    const context: string = parsed.hookSpecificOutput.additionalContext;
    expect(context.startsWith(LEAD)).toBe(true);
    expect(context).toContain(
      `sidekick:sk-design: ${readSkillDescription(LIVE_SKILL)}`,
    );
  });

  test('extra fields in the event do not stop the nudge', () => {
    const stdin = event('superpowers:brainstorming', {
      session_id: 'abc',
      tool_input: { skill: 'superpowers:brainstorming', args: '#119' },
      tool_response: { success: true },
    });
    expect(run(stdin).out.length).toBe(1);
  });

  test('other skills print nothing and return 0', () => {
    for (const skill of [
      'superpowers:systematic-debugging',
      'sidekick:sk-design',
      'brainstorming',
    ]) {
      expect(run(event(skill))).toEqual({ code: 0, out: [], err: [] });
    }
  });

  test('malformed stdin prints nothing and returns 0', () => {
    for (const stdin of [
      '',
      'not json',
      'null',
      '[]',
      '{"tool_input":{}}',
      '{"tool_input":{"skill":42}}',
    ]) {
      expect(run(stdin)).toEqual({ code: 0, out: [], err: [] });
    }
  });

  test('a plugin dir without sk-design prints nothing and returns 0', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-hook-plugin-'));
    expect(run(event('superpowers:brainstorming'), empty)).toEqual({
      code: 0,
      out: [],
      err: [],
    });
  });

  test('an unknown verb prints usage and returns 1 without reading stdin', () => {
    const err: string[] = [];
    const code = runHookCli(
      ['pre-skill'],
      {
        readStdin: () => {
          throw new Error('stdin read before the verb check');
        },
        pluginDir: PLUGIN_DIR,
      },
      () => {},
      (l) => err.push(l),
    );
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('sidekick hook post-skill');
  });
});

describe('plugin/hooks/post-skill', () => {
  test('passes stdin to the bundled CLI and prints the nudge', () => {
    const r = spawnSync('bash', [WRAPPER], {
      input: event('superpowers:brainstorming'),
      encoding: 'utf-8',
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed.hookSpecificOutput.additionalContext.startsWith(LEAD)).toBe(
      true,
    );
  });

  test('exits 0 silently when node is not on PATH', () => {
    const r = spawnSync('/bin/bash', [WRAPPER], {
      input: event('superpowers:brainstorming'),
      encoding: 'utf-8',
      env: { PATH: '/nonexistent' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });
});

describe('readSection', () => {
  test('returns the heading and its body up to the next H2, keeping deeper headings', () => {
    const file = tmpFile(
      'rule.md',
      '# Title\n\n## Comments\n\nOne line.\n\n### Detail\n\nMore.\n\n## Next\n\nOther.\n',
    );
    expect(readSection(file, '## Comments')).toBe(
      '## Comments\n\nOne line.\n\n### Detail\n\nMore.',
    );
  });

  test('a last section runs to the end of the file', () => {
    const file = tmpFile('rule.md', '## First\n\na\n\n## Comments\n\nTail.\n');
    expect(readSection(file, '## Comments')).toBe('## Comments\n\nTail.');
  });

  test('CRLF line endings still find the heading and the next H2', () => {
    const file = tmpFile(
      'rule.md',
      '## Comments\r\n\r\nOne line.\r\n\r\n## Next\r\n',
    );
    expect(readSection(file, '## Comments')).toBe('## Comments\n\nOne line.');
  });

  test('undefined for a missing file, an absent heading, or a longer heading', () => {
    expect(readSection(path.join(os.tmpdir(), 'nope.md'), '## Comments')).toBe(
      undefined,
    );
    expect(
      readSection(tmpFile('rule.md', '## Other\n\nx\n'), '## Comments'),
    ).toBe(undefined);
    expect(
      readSection(
        tmpFile('rule.md', '## Comments and more\n\nx\n'),
        '## Comments',
      ),
    ).toBe(undefined);
  });

  test('a ## line inside a fenced code block does not end the section', () => {
    const file = tmpFile(
      'rule.md',
      '## Comments\n\nBefore.\n\n```md\n## not a heading\n```\n\nAfter.\n\n## Next\n\nOther.\n',
    );
    expect(readSection(file, '## Comments')).toBe(
      '## Comments\n\nBefore.\n\n```md\n## not a heading\n```\n\nAfter.',
    );
  });

  test('the live sk-clean-code Comments section is one H2 section of the rule', () => {
    const section = readSection(CLEAN_CODE, '## Comments');
    if (section === undefined) throw new Error('## Comments missing');
    expect(section.startsWith('## Comments\n')).toBe(true);
    expect(section).toContain('Default to none.');
    expect(section).not.toContain('\n## ');
    expect(fs.readFileSync(CLEAN_CODE, 'utf-8')).toContain(section);
  });
});

describe('runHookCli post-read', () => {
  test('a review package read adds the reviewer lines and the live Comments section', () => {
    const { code, out, err } = runVerb(
      'post-read',
      pkgEvent(pkgContent('bin/helpers/hook.ts')),
    );
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.length).toBe(1);
    const parsed = JSON.parse(out[0]);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    const context: string = parsed.hookSpecificOutput.additionalContext;
    expect(context.startsWith(READ_LEAD)).toBe(true);
    expect(context).toContain('Credit only the results you reproduce.');
    expect(context).toContain(
      "superpowers' rule that a reviewer runs checks only on a specific doubt",
    );
    expect(
      context.endsWith(String(readSection(CLEAN_CODE, '## Comments'))),
    ).toBe(true);
  });

  test('packages match at any depth, as relative paths, and in worktrees', () => {
    for (const filePath of [
      '/a/b/.superpowers/sdd/plan/review-abc1234..def5678.diff',
      '.superpowers/sdd/plan/review-abc1234..def5678.diff',
      '/r/.worktrees/x/.superpowers/sdd/docs-plan-2/review-0123456789ab..fedcba987654.diff',
    ]) {
      expect(runVerb('post-read', readEvent(filePath)).out.length).toBe(1);
    }
  });

  test('every other path prints nothing and returns 0', () => {
    for (const filePath of [
      '/repo/notes.txt',
      '/repo/review-abc1234..def5678.diff',
      '/repo/.superpowers/sdd/plan/task-1-brief.md',
      '/repo/.superpowers/sdd/plan/review-abc1234..def5678.diff.bak',
      '/repo/.superpowers/sdd/plan/sub/review-abc1234..def5678.diff',
      '/repo/.superpowers/sdd/review-abc1234..def5678.diff',
      '/repo/.superpowers/sdd/plan/review-XYZ..def5678.diff',
      '/repo/x.superpowers/sdd/plan/review-abc1234..def5678.diff',
    ]) {
      expect(runVerb('post-read', readEvent(filePath))).toEqual({
        code: 0,
        out: [],
        err: [],
      });
    }
  });

  test('a package path that appears only in the file content prints nothing', () => {
    const stdin = readEvent('/repo/notes.txt', {
      tool_response: { file: { content: PACKAGE } },
    });
    expect(runVerb('post-read', stdin)).toEqual({ code: 0, out: [], err: [] });
  });

  test('other tools and malformed stdin print nothing and return 0', () => {
    for (const stdin of [
      '',
      'not json',
      'null',
      '{"tool_name":"Read"}',
      '{"tool_name":"Read","tool_input":{"file_path":42}}',
      JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: PACKAGE } }),
      event('superpowers:brainstorming'),
    ]) {
      expect(runVerb('post-read', stdin)).toEqual({
        code: 0,
        out: [],
        err: [],
      });
    }
  });

  test('a plugin dir without the rule, or a rule without Comments, prints nothing', () => {
    for (const pluginDir of [
      tmpPlugin(undefined),
      tmpPlugin('## Functions\n\nx\n'),
    ]) {
      expect(
        runVerb('post-read', pkgEvent(pkgContent('a.ts')), pluginDir),
      ).toEqual({
        code: 0,
        out: [],
        err: [],
      });
    }
  });
});

describe('post-read scopes the Comments paragraph to the rule paths', () => {
  const RULE_BODY = '## Comments\n\nDefault to none.\n';
  const scoped = (paths: string) =>
    tmpPlugin(`---\npaths:\n${paths}---\n\n# Rule\n\n${RULE_BODY}`);
  const TS_RULE = scoped('  - "**/*.ts"\n  - "**/*.tsx"\n');
  const contextOf = (stdin: string, pluginDir = TS_RULE): string => {
    const { out } = runVerb('post-read', stdin, pluginDir);
    expect(out.length).toBe(1);
    return JSON.parse(out[0]).hookSpecificOutput.additionalContext;
  };
  const HOLD = 'Hold the comments this diff adds';

  test('a package listing only .py files keeps the lead and the reproduce paragraph, without Comments', () => {
    const context = contextOf(pkgEvent(pkgContent('tools/a.py', 'docs/b.md')));
    expect(context.startsWith(READ_LEAD)).toBe(true);
    expect(context.split('\n')[0]).not.toMatch(/\btwo\b/);
    expect(context).toContain('Credit only the results you reproduce.');
    expect(context).not.toContain(HOLD);
    expect(context).not.toContain('Default to none.');
  });

  test('a .ts file in a stat line includes the Comments paragraph and section', () => {
    const context = contextOf(pkgEvent(pkgContent('tools/a.py', 'src/b.ts')));
    expect(context).toContain(HOLD);
    expect(context.endsWith('## Comments\n\nDefault to none.')).toBe(true);
  });

  test('a .ts file in a diff header alone includes it', () => {
    const content =
      '# Review package: a..b\n\n## Diff\n\ndiff --git a/src/x.ts b/src/x.ts\n';
    expect(contextOf(pkgEvent(content))).toContain(HOLD);
  });

  test('an abbreviated stat path ending in .tsx matches', () => {
    expect(
      contextOf(pkgEvent(pkgContent('.../components/deep/Button.tsx'))),
    ).toContain(HOLD);
  });

  test('a rule without paths always includes it', () => {
    const plugin = tmpPlugin(`# Rule\n\n${RULE_BODY}`);
    expect(contextOf(pkgEvent(pkgContent('a.py')), plugin)).toContain(HOLD);
    expect(contextOf(pkgEvent(''), plugin)).toContain(HOLD);
  });

  test('a rule with an unsupported pattern shape includes it', () => {
    const plugin = scoped('  - "src/**/{a,b}.ts"\n');
    expect(contextOf(pkgEvent(pkgContent('a.py')), plugin)).toContain(HOLD);
  });

  test('a package read with no visible file list gets no Comments paragraph', () => {
    for (const stdin of [
      readEvent(PACKAGE),
      pkgEvent(''),
      pkgEvent('diff text with no headers'),
    ]) {
      const context = contextOf(stdin);
      expect(context.startsWith(READ_LEAD)).toBe(true);
      expect(context).not.toContain(HOLD);
    }
  });
});

describe('plugin/hooks/post-read', () => {
  test('passes a package read to the bundled CLI and prints the reviewer lines', () => {
    const r = spawnSync('bash', [READ_WRAPPER], {
      input: readEvent(PACKAGE),
      encoding: 'utf-8',
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout.trim());
    expect(
      parsed.hookSpecificOutput.additionalContext.startsWith(READ_LEAD),
    ).toBe(true);
  });

  test('ends in bash for any other read, and starts node for a package', () => {
    const other = fakeNode();
    const r = spawnSync('/bin/bash', [READ_WRAPPER], {
      input: readEvent('/repo/notes.txt'),
      encoding: 'utf-8',
      env: { PATH: `${other.binDir}:/usr/bin:/bin` },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(fs.existsSync(other.marker)).toBe(false);
    const pkg = fakeNode();
    spawnSync('/bin/bash', [READ_WRAPPER], {
      input: readEvent(PACKAGE),
      encoding: 'utf-8',
      env: { PATH: `${pkg.binDir}:/usr/bin:/bin` },
    });
    expect(fs.existsSync(pkg.marker)).toBe(true);
  });

  test('a package path with JSON-escaped slashes still reaches the CLI', () => {
    const r = spawnSync('bash', [READ_WRAPPER], {
      input: readEvent(PACKAGE).replaceAll('/', '\\/'),
      encoding: 'utf-8',
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout.trim());
    expect(
      parsed.hookSpecificOutput.additionalContext.startsWith(READ_LEAD),
    ).toBe(true);
  });

  test('a large read of another file exits 0 with no output', () => {
    const r = spawnSync('bash', [READ_WRAPPER], {
      input: readEvent('/repo/big.txt', {
        tool_response: { file: { content: 'x'.repeat(2_000_000) } },
      }),
      encoding: 'utf-8',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  test('exits 0 silently for a package when node is not on PATH', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-min-bin-'));
    for (const tool of ['cat', 'dirname']) {
      const found = spawnSync('/bin/sh', ['-c', `command -v ${tool}`], {
        encoding: 'utf-8',
      }).stdout.trim();
      fs.symlinkSync(fs.realpathSync(found), path.join(binDir, tool));
    }
    const r = spawnSync('/bin/bash', [READ_WRAPPER], {
      input: readEvent(PACKAGE),
      encoding: 'utf-8',
      env: { PATH: binDir },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  test('an input repeating the prefilter tokens without .diff exits fast and silent', () => {
    const input = readEvent('/repo/x.txt', {
      tool_response: {
        file: { content: 'superpowers sdd review- '.repeat(2000) },
      },
    });
    const start = performance.now();
    const r = spawnSync('bash', [READ_WRAPPER], {
      input,
      encoding: 'utf-8',
      timeout: 10_000,
    });
    const elapsed = performance.now() - start;
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(elapsed).toBeLessThan(2000);
  });
});
