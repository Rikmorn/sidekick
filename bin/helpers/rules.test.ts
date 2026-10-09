import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkRules, installRules, resolveDest, runRulesCli } from './rules.js';

function gitInit(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
}

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
    expect(installRules(src, dest)).toEqual({
      installed: [],
      removed: [],
      skipped: [],
    });
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

  test('install --project run from a repo subdirectory writes at the repo root', () => {
    const src = tmp();
    const repo = tmp();
    gitInit(repo);
    const sub = path.join(repo, 'packages', 'web');
    fs.mkdirSync(sub, { recursive: true });
    const home = tmp();
    write(src, 'sk-a.md', RULE_A);
    const lines: string[] = [];
    const code = runRulesCli(
      ['install', '--project'],
      { src, cwd: sub, claudeHome: home },
      (l) => lines.push(l),
    );
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(repo, '.claude', 'rules', 'sk-a.md'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(sub, '.claude', 'rules', 'sk-a.md'))).toBe(
      false,
    );
    expect(lines.join('\n')).toContain(
      `project root: ${fs.realpathSync(repo)}`,
    );
  });

  test('install --project falls back to cwd when it is outside a git work tree', () => {
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
    expect(lines.join('\n')).toContain(`project root: ${cwd}`);
  });

  test('check --user reports drift and overlap and exits 0; --strict exits 1 on drift only', () => {
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
    const env = { src, cwd, claudeHome: home };
    const lines: string[] = [];
    expect(runRulesCli(['check', '--user'], env, (l) => lines.push(l))).toBe(0);
    const text = lines.join('\n');
    expect(text).toContain('[stale] sk-a.md');
    expect(text).toContain('mine.md overlaps sk-a.md on opening');
    expect(runRulesCli(['check', '--user', '--strict'], env, () => {})).toBe(1);
    expect(runRulesCli(['check', '--strict', '--user'], env, () => {})).toBe(1);
    installRules(src, path.join(home, 'rules'));
    const clean: string[] = [];
    expect(
      runRulesCli(['check', '--user', '--strict'], env, (l) => clean.push(l)),
    ).toBe(0);
    expect(clean.join('\n')).toContain('1 rule(s) match');
  });

  test('install --project exits 0 on a skipped write, and 1 with --strict', () => {
    const src = tmp();
    const cwd = tmp();
    const home = tmp();
    const outside = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(outside, 'real.md', 'do not touch me');
    const rules = path.join(cwd, '.claude', 'rules');
    fs.mkdirSync(rules, { recursive: true });
    fs.symlinkSync(path.join(outside, 'real.md'), path.join(rules, 'sk-a.md'));
    const env = { src, cwd, claudeHome: home };
    const lines: string[] = [];
    expect(
      runRulesCli(['install', '--project'], env, (l) => lines.push(l)),
    ).toBe(0);
    expect(lines.join('\n')).toContain('[skipped:not-a-regular-file] sk-a.md');
    expect(
      runRulesCli(['install', '--project', '--strict'], env, () => {}),
    ).toBe(1);
  });

  test('an overlap finding alone exits 0 even with --strict', () => {
    const src = tmp();
    const cwd = tmp();
    const home = tmp();
    write(src, 'sk-a.md', RULE_A);
    installRules(src, path.join(home, 'rules'));
    write(
      path.join(home, 'rules'),
      'mine.md',
      '# Mine\n\nKeep functions small.\n',
    );
    const lines: string[] = [];
    expect(
      runRulesCli(
        ['check', '--user', '--strict'],
        { src, cwd, claudeHome: home },
        (l) => lines.push(l),
      ),
    ).toBe(0);
    expect(lines.join('\n')).toContain('mine.md overlaps sk-a.md');
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

describe('installRules hazards', () => {
  test('never writes through a symlink and leaves the linked file untouched', () => {
    const src = tmp();
    const dest = tmp();
    const outside = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(outside, 'real.md', 'do not touch me');
    fs.symlinkSync(path.join(outside, 'real.md'), path.join(dest, 'sk-a.md'));
    const result = installRules(src, dest);
    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual([
      { name: 'sk-a.md', why: 'not-a-regular-file' },
    ]);
    expect(fs.lstatSync(path.join(dest, 'sk-a.md')).isSymbolicLink()).toBe(
      true,
    );
    expect(fs.readFileSync(path.join(outside, 'real.md'), 'utf-8')).toBe(
      'do not touch me',
    );
  });

  test('never writes through a case-insensitive collision and leaves the colliding file untouched', () => {
    const src = tmp();
    const dest = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(dest, 'SK-A.MD', 'colleague content, do not touch');
    const result = installRules(src, dest);
    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual([
      { name: 'sk-a.md', why: 'case-collision' },
    ]);
    expect(fs.readdirSync(dest)).toEqual(['SK-A.MD']);
    expect(fs.readFileSync(path.join(dest, 'SK-A.MD'), 'utf-8')).toBe(
      'colleague content, do not touch',
    );
  });

  test('never writes through a directory shaped like a shipped rule name', () => {
    const src = tmp();
    const dest = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(path.join(dest, 'sk-a.md'), 'inner.txt', 'do not touch');
    const result = installRules(src, dest);
    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual([
      { name: 'sk-a.md', why: 'not-a-regular-file' },
    ]);
    expect(fs.lstatSync(path.join(dest, 'sk-a.md')).isDirectory()).toBe(true);
    expect(
      fs.readFileSync(path.join(dest, 'sk-a.md', 'inner.txt'), 'utf-8'),
    ).toBe('do not touch');
  });
});

describe('ownedRulesIn crash-proofing', () => {
  test('a broken symlink named sk-*.md in dest does not throw and survives pruning untouched', () => {
    const src = tmp();
    const dest = tmp();
    write(src, 'sk-a.md', RULE_A);
    fs.symlinkSync(
      path.join(dest, 'nonexistent-target.md'),
      path.join(dest, 'sk-old.md'),
    );
    expect(checkRules(src, dest)).toEqual([
      { kind: 'missing', name: 'sk-a.md' },
    ]);
    const result = installRules(src, dest);
    expect(result.installed).toEqual(['sk-a.md']);
    expect(result.removed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(fs.lstatSync(path.join(dest, 'sk-old.md')).isSymbolicLink()).toBe(
      true,
    );
    expect(fs.readlinkSync(path.join(dest, 'sk-old.md'))).toBe(
      path.join(dest, 'nonexistent-target.md'),
    );
  });
});

describe('runRulesCli hazards', () => {
  test('refuses when dest exists as a plain file, without writing or throwing', () => {
    const src = tmp();
    const cwd = tmp();
    const home = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(path.join(cwd, '.claude'), 'rules', 'not a directory, do not touch');
    const lines: string[] = [];
    const code = runRulesCli(
      ['install', '--project'],
      { src, cwd, claudeHome: home },
      (l) => lines.push(l),
    );
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('is not a directory');
    expect(fs.readFileSync(path.join(cwd, '.claude', 'rules'), 'utf-8')).toBe(
      'not a directory, do not touch',
    );
    expect(fs.statSync(path.join(cwd, '.claude', 'rules')).isFile()).toBe(true);

    const checkLines: string[] = [];
    const checkCode = runRulesCli(
      ['check', '--project'],
      { src, cwd, claudeHome: home },
      (l) => checkLines.push(l),
    );
    expect(checkCode).toBe(1);
    expect(checkLines.join('\n')).toContain('is not a directory');
  });
});
