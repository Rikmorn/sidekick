import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  checkRules,
  findOverlap,
  installRules,
  resolveDest,
  runRulesCli,
} from './rules.js';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sk-rules-'));
}
function write(dir: string, name: string, body: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
}
const RULE_A =
  '# Clean code\n\nKeep functions small.\n\n## Comments\n\nSay why.\n';
const RULE_B =
  '# Language\n\nWrite in British English.\n\n## Voice\n\nBe direct.\n';

describe('resolveDest', () => {
  test('project scope is the repo .claude/rules; user scope is claudeHome/rules', () => {
    expect(resolveDest('project', '/repo', '/home/.claude')).toBe(
      path.join('/repo', '.claude', 'rules'),
    );
    expect(resolveDest('user', '/repo', '/home/.claude')).toBe(
      path.join('/home/.claude', 'rules'),
    );
  });
});

describe('installRules', () => {
  test('copies every sk-*.md, prunes retired sk-*.md, and leaves everything else alone', () => {
    const src = tmp();
    const dest = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(src, 'sk-b.md', RULE_B);
    write(src, 'README.md', 'not a rule');
    write(dest, 'sk-a.md', 'old copy');
    write(dest, 'sk-old.md', 'retired');
    write(dest, 'house.md', 'keep me');
    fs.mkdirSync(path.join(dest, 'sk-nested'));
    const result = installRules(src, dest);
    expect(result.installed.sort()).toEqual(['sk-a.md', 'sk-b.md']);
    expect(result.removed).toEqual(['sk-old.md']);
    expect(fs.readFileSync(path.join(dest, 'sk-a.md'), 'utf-8')).toBe(RULE_A);
    expect(fs.existsSync(path.join(dest, 'README.md'))).toBe(false);
    expect(fs.readFileSync(path.join(dest, 'house.md'), 'utf-8')).toBe(
      'keep me',
    );
    expect(fs.existsSync(path.join(dest, 'sk-nested'))).toBe(true);
  });

  test('creates the destination when missing', () => {
    const src = tmp();
    write(src, 'sk-a.md', RULE_A);
    const dest = path.join(tmp(), '.claude', 'rules');
    installRules(src, dest);
    expect(fs.existsSync(path.join(dest, 'sk-a.md'))).toBe(true);
  });

  test('an empty source installs nothing and prunes nothing', () => {
    const src = tmp();
    const dest = tmp();
    write(dest, 'sk-old.md', 'retired');
    expect(installRules(src, dest)).toEqual({ installed: [], removed: [] });
    expect(fs.existsSync(path.join(dest, 'sk-old.md'))).toBe(true);
  });
});

describe('checkRules', () => {
  test('classifies stale, missing, and orphaned; silent when everything matches', () => {
    const src = tmp();
    const dest = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(src, 'sk-b.md', RULE_B);
    write(dest, 'sk-a.md', 'drifted');
    write(dest, 'sk-old.md', 'retired');
    write(dest, 'house.md', 'not ours');
    expect(
      checkRules(src, dest).sort((x, y) => x.name.localeCompare(y.name)),
    ).toEqual([
      { kind: 'stale', name: 'sk-a.md' },
      { kind: 'missing', name: 'sk-b.md' },
      { kind: 'orphaned', name: 'sk-old.md' },
    ]);
    installRules(src, dest);
    expect(checkRules(src, dest)).toEqual([]);
  });
});

describe('findOverlap', () => {
  test('reports a non-sk file that shares a heading or an opening sentence with a shipped rule', () => {
    const src = tmp();
    const dest = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(src, 'sk-b.md', RULE_B);
    write(
      dest,
      'clean-code.md',
      '# Our clean code\n\nSomething else.\n\n## Comments\n\nDifferent body.\n',
    );
    write(dest, 'style.md', '# Style\n\nWrite in British English.\n');
    write(
      dest,
      'unrelated.md',
      '# Deploy\n\nRun the pipeline.\n\n## Rollback\n\nRevert.\n',
    );
    write(dest, 'sk-a.md', RULE_A);
    expect(
      findOverlap(src, dest).sort((x, y) => x.file.localeCompare(y.file)),
    ).toEqual([
      {
        file: 'clean-code.md',
        rule: 'sk-a.md',
        on: 'heading',
        value: 'comments',
      },
      {
        file: 'style.md',
        rule: 'sk-b.md',
        on: 'opening',
        value: 'write in british english',
      },
    ]);
  });

  test('ignores frontmatter when finding the opening sentence', () => {
    const src = tmp();
    const dest = tmp();
    write(src, 'sk-b.md', RULE_B);
    write(
      dest,
      'scoped.md',
      '---\npaths:\n  - "src/**"\n---\n\n# Scoped\n\nWrite in British English. Always.\n',
    );
    expect(findOverlap(src, dest)).toEqual([
      {
        file: 'scoped.md',
        rule: 'sk-b.md',
        on: 'opening',
        value: 'write in british english',
      },
    ]);
  });
});

describe('runRulesCli', () => {
  test('install --project writes into cwd/.claude/rules and reports', () => {
    const src = tmp();
    const cwd = tmp();
    const home = tmp();
    write(src, 'sk-a.md', RULE_A);
    const lines: string[] = [];
    const code = runRulesCli(
      ['install', '--project'],
      { src, cwd, claudeHome: home },
      (l) => lines.push(l),
    );
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(cwd, '.claude', 'rules', 'sk-a.md'))).toBe(
      true,
    );
    expect(lines.join('\n')).toContain('installed 1 rule');
  });

  test('check --user reports drift and overlap, exit 0 when clean, 2 when drifted', () => {
    const src = tmp();
    const cwd = tmp();
    const home = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(path.join(home, 'rules'), 'sk-a.md', 'drifted');
    write(
      path.join(home, 'rules'),
      'mine.md',
      '# Mine\n\nKeep functions small.\n',
    );
    const lines: string[] = [];
    const code = runRulesCli(
      ['check', '--user'],
      { src, cwd, claudeHome: home },
      (l) => lines.push(l),
    );
    expect(code).toBe(2);
    const text = lines.join('\n');
    expect(text).toContain('[stale] sk-a.md');
    expect(text).toContain(
      'mine.md overlaps sk-a.md on opening: keep functions small',
    );
    installRules(src, path.join(home, 'rules'));
    const clean: string[] = [];
    expect(
      runRulesCli(['check', '--user'], { src, cwd, claudeHome: home }, (l) =>
        clean.push(l),
      ),
    ).toBe(0);
    expect(clean.join('\n')).toContain('1 rule(s) match');
  });

  test('refuses a missing scope, an unknown verb, and an empty source', () => {
    const src = tmp();
    const cwd = tmp();
    const home = tmp();
    const out = (): void => {};
    expect(runRulesCli(['install'], { src, cwd, claudeHome: home }, out)).toBe(
      1,
    );
    expect(
      runRulesCli(
        ['frobnicate', '--project'],
        { src, cwd, claudeHome: home },
        out,
      ),
    ).toBe(1);
    expect(
      runRulesCli(
        ['install', '--project'],
        { src, cwd, claudeHome: home },
        out,
      ),
    ).toBe(1);
  });
});
