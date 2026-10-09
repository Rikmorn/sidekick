import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  checkRules,
  EVERY_RULE,
  installRules,
  PLUGIN_ONLY_RULES,
  pluginEnablement,
  projectSet,
  resolveDest,
  runRulesCli,
} from './rules.js';

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
      leftOut: [],
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

const PM = 'sk-pm-conventions.md';

function settings(repo: string, body: string): string {
  write(path.join(repo, '.claude'), 'settings.json', body);
  return path.join(repo, '.claude', 'settings.json');
}

describe('PLUGIN_ONLY_RULES', () => {
  test('every name exists in the real plugin/rules', () => {
    const real = path.join(import.meta.dir, '..', '..', 'plugin', 'rules');
    for (const name of PLUGIN_ONLY_RULES) {
      expect(fs.existsSync(path.join(real, name))).toBe(true);
    }
  });
});

describe('pluginEnablement', () => {
  const read = (body: string | undefined) => {
    const repo = tmp();
    if (body !== undefined) settings(repo, body);
    return { repo, result: pluginEnablement(repo) };
  };

  test('absent, {}, and an empty or blank file are not-enabled', () => {
    expect(read(undefined).result).toEqual({ state: 'not-enabled' });
    expect(read('{}').result).toEqual({ state: 'not-enabled' });
    expect(read('').result).toEqual({ state: 'not-enabled' });
    expect(read('  \n').result).toEqual({ state: 'not-enabled' });
  });

  test('a true sidekick@ key is enabled', () => {
    expect(read('{"enabledPlugins":{"sidekick@rikmorn":true}}').result).toEqual(
      { state: 'enabled' },
    );
  });

  test('a false sidekick key, another plugin, or a non-object enabledPlugins is not-enabled', () => {
    expect(
      read('{"enabledPlugins":{"sidekick@rikmorn":false}}').result,
    ).toEqual({ state: 'not-enabled' });
    expect(read('{"enabledPlugins":{"other@x":true}}').result).toEqual({
      state: 'not-enabled',
    });
    expect(read('{"enabledPlugins":[]}').result).toEqual({
      state: 'not-enabled',
    });
  });

  test('invalid JSON and a non-object root are unreadable, with path and reason', () => {
    for (const body of ['{nope', '[]', 'null']) {
      const { repo, result } = read(body);
      expect(result.state).toBe('unreadable');
      if (result.state !== 'unreadable') throw new Error('unreachable');
      expect(result.path).toBe(path.join(repo, '.claude', 'settings.json'));
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  test('a settings.json that is a directory is unreadable', () => {
    const repo = tmp();
    fs.mkdirSync(path.join(repo, '.claude', 'settings.json'), {
      recursive: true,
    });
    expect(pluginEnablement(repo).state).toBe('unreadable');
  });
});

describe('projectSet', () => {
  test('maps each state to what the scope delivers', () => {
    expect(projectSet({ state: 'enabled' })).toEqual(EVERY_RULE);
    expect(projectSet({ state: 'not-enabled' })).toEqual({
      leaveOut: PLUGIN_ONLY_RULES,
      leaveAsIs: [],
    });
    expect(projectSet({ state: 'unreadable', path: 'p', reason: 'r' })).toEqual(
      { leaveOut: [], leaveAsIs: PLUGIN_ONLY_RULES },
    );
  });
});

describe('installRules and checkRules with a scope set', () => {
  const leaveOut = { leaveOut: [PM], leaveAsIs: [] };
  const leaveAsIs = { leaveOut: [], leaveAsIs: [PM] };
  const fixture = () => {
    const src = tmp();
    const dest = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(src, PM, RULE_B);
    return { src, dest };
  };

  test('leaveOut removes an existing copy into leftOut, not removed, and writes the rest', () => {
    const { src, dest } = fixture();
    write(dest, PM, 'old');
    const r = installRules(src, dest, leaveOut);
    expect(r.installed).toEqual(['sk-a.md']);
    expect(r.leftOut).toEqual([PM]);
    expect(r.removed).toEqual([]);
    expect(fs.existsSync(path.join(dest, PM))).toBe(false);
  });

  test('leaveOut with no copy writes the rest and reports nothing left out', () => {
    const { src, dest } = fixture();
    const r = installRules(src, dest, leaveOut);
    expect(r.installed).toEqual(['sk-a.md']);
    expect(r.leftOut).toEqual([]);
  });

  test('a retired rule is still removed, not left out', () => {
    const { src, dest } = fixture();
    write(dest, 'sk-gone.md', 'x');
    const r = installRules(src, dest, leaveOut);
    expect(r.removed).toEqual(['sk-gone.md']);
    expect(r.leftOut).toEqual([]);
  });

  test('leaveAsIs never deletes or writes: a copy stays byte-identical', () => {
    const { src, dest } = fixture();
    write(dest, PM, 'old');
    const r = installRules(src, dest, leaveAsIs);
    expect(r.installed).toEqual(['sk-a.md']);
    expect(r.leftOut).toEqual([]);
    expect(r.removed).toEqual([]);
    expect(fs.readFileSync(path.join(dest, PM), 'utf-8')).toBe('old');
  });

  test('leaveAsIs leaves an absent copy absent', () => {
    const { src, dest } = fixture();
    installRules(src, dest, leaveAsIs);
    expect(fs.existsSync(path.join(dest, PM))).toBe(false);
  });

  test('leaveOut for a name the source does not ship retires the copy once, without throwing', () => {
    const src = tmp();
    const dest = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(dest, PM, 'old');
    const r = installRules(src, dest, leaveOut);
    expect(r.removed).toEqual([PM]);
    expect(r.leftOut).toEqual([]);
    expect(fs.existsSync(path.join(dest, PM))).toBe(false);
  });

  test('leaveAsIs for an unshipped name: install and check agree it is retired', () => {
    const src = tmp();
    const dest = tmp();
    write(src, 'sk-a.md', RULE_A);
    write(dest, 'sk-a.md', RULE_A);
    write(dest, PM, 'old');
    expect(checkRules(src, dest, leaveAsIs)).toEqual([
      { kind: 'orphaned', name: PM },
    ]);
    const r = installRules(src, dest, leaveAsIs);
    expect(r.removed).toEqual([PM]);
    expect(checkRules(src, dest, leaveAsIs)).toEqual([]);
  });

  test('the CLI does not throw when the source omits the plugin-only rule', () => {
    const src = tmp();
    const cwd = tmp();
    gitInit(cwd);
    write(src, 'sk-a.md', RULE_A);
    write(path.join(cwd, '.claude', 'rules'), PM, 'old');
    const lines: string[] = [];
    const code = runRulesCli(
      ['install', '--project'],
      { src, cwd, claudeHome: tmp() },
      (l) => lines.push(l),
    );
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain(`removed retired: ${PM}`);
  });

  test('the default set is every rule', () => {
    const { src, dest } = fixture();
    expect(installRules(src, dest).installed).toEqual(['sk-a.md', PM]);
  });

  test('checkRules with leaveOut: an absent copy is not missing, a present one is orphaned', () => {
    const { src, dest } = fixture();
    write(dest, 'sk-a.md', RULE_A);
    expect(checkRules(src, dest, leaveOut)).toEqual([]);
    write(dest, PM, RULE_B);
    expect(checkRules(src, dest, leaveOut)).toEqual([
      { kind: 'orphaned', name: PM },
    ]);
  });

  test('checkRules with leaveAsIs: neither missing nor orphaned', () => {
    const { src, dest } = fixture();
    write(dest, 'sk-a.md', RULE_A);
    expect(checkRules(src, dest, leaveAsIs)).toEqual([]);
    write(dest, PM, 'different');
    expect(checkRules(src, dest, leaveAsIs)).toEqual([]);
  });
});

describe('runRulesCli --project and the plugin-only rules', () => {
  const run = (args: string[], env: { src: string; cwd: string }) => {
    const lines: string[] = [];
    const code = runRulesCli(args, { ...env, claudeHome: tmp() }, (l) =>
      lines.push(l),
    );
    return { code, text: lines.join('\n') };
  };
  const setup = () => {
    const src = tmp();
    const cwd = tmp();
    gitInit(cwd);
    write(src, 'sk-a.md', RULE_A);
    write(src, PM, RULE_B);
    return { src, cwd, copy: path.join(cwd, '.claude', 'rules', PM) };
  };

  test('with no settings the PM rule is not delivered, and a later check is clean', () => {
    const { src, cwd, copy } = setup();
    const r = run(['install', '--project'], { src, cwd });
    expect(r.code).toBe(0);
    expect(fs.existsSync(copy)).toBe(false);
    expect(r.text).toContain(
      `not delivered to this repo: ${PM}; its .claude/settings.json does not enable sidekick, so it comes from user level only`,
    );
    const c = run(['check', '--project', '--strict'], { src, cwd });
    expect(c.code).toBe(0);
    expect(c.text).toContain('1 rule(s) match');
    expect(c.text).not.toContain('[missing]');
  });

  test('enabling delivers it, disabling removes it with its own line', () => {
    const { src, cwd, copy } = setup();
    const file = settings(cwd, '{"enabledPlugins":{"sidekick@rikmorn":true}}');
    run(['install', '--project'], { src, cwd });
    expect(fs.existsSync(copy)).toBe(true);
    fs.writeFileSync(file, '{}');
    const r = run(['install', '--project'], { src, cwd });
    expect(fs.existsSync(copy)).toBe(false);
    expect(r.text).toContain(`removed: ${PM} (not delivered to this repo)`);
    expect(r.text).not.toContain('removed retired');
  });

  test('check reports a not-enabled repo copy as orphaned', () => {
    const { src, cwd, copy } = setup();
    run(['install', '--project'], { src, cwd });
    write(path.dirname(copy), PM, RULE_B);
    const c = run(['check', '--project', '--strict'], { src, cwd });
    expect(c.code).toBe(1);
    expect(c.text).toContain(`[orphaned] ${PM}`);
    expect(c.text).toContain('not delivered to this repo');
  });

  test('unreadable settings never delete or write: the copy stays and a line says why', () => {
    const { src, cwd, copy } = setup();
    write(path.dirname(copy), PM, 'precious');
    settings(cwd, '{nope');
    const file = path.join(fs.realpathSync(cwd), '.claude', 'settings.json');
    const r = run(['install', '--project'], { src, cwd });
    expect(r.code).toBe(0);
    expect(fs.readFileSync(copy, 'utf-8')).toBe('precious');
    expect(r.text).toContain(`left ${PM} as it is: could not read ${file} (`);
    expect(r.text).not.toContain('removed');
    const c = run(['check', '--project', '--strict'], { src, cwd });
    expect(c.code).toBe(0);
    expect(c.text).not.toContain('[orphaned]');
  });

  test('unreadable settings with no copy leaves it absent', () => {
    const { src, cwd, copy } = setup();
    settings(cwd, '[]');
    run(['install', '--project'], { src, cwd });
    expect(fs.existsSync(copy)).toBe(false);
  });

  test('--user always delivers every rule', () => {
    const { src, cwd } = setup();
    const home = tmp();
    const lines: string[] = [];
    runRulesCli(['install', '--user'], { src, cwd, claudeHome: home }, (l) =>
      lines.push(l),
    );
    expect(fs.existsSync(path.join(home, 'rules', PM))).toBe(true);
    expect(lines.join('\n')).not.toContain('not delivered');
  });
});

describe('runRulesCli --project check with no sk-* copies in the repo', () => {
  const setup = () => {
    const src = tmp();
    const cwd = tmp();
    const home = tmp();
    gitInit(cwd);
    write(src, 'sk-a.md', RULE_A);
    return {
      src,
      cwd,
      home,
      user: path.join(home, 'rules'),
      project: path.join(cwd, '.claude', 'rules'),
    };
  };
  const check = (
    e: { src: string; cwd: string; home: string },
    extra: string[] = [],
  ) => {
    const lines: string[] = [];
    const code = runRulesCli(
      ['check', '--project', ...extra],
      { src: e.src, cwd: e.cwd, claudeHome: e.home },
      (l) => lines.push(l),
    );
    return { code, text: lines.join('\n') };
  };

  test('matching user copies check clean and the line names the source', () => {
    const e = setup();
    write(e.user, 'sk-a.md', RULE_A);
    const r = check(e, ['--strict']);
    expect(r.code).toBe(0);
    expect(r.text).toContain(
      `no sk-* rules in ${path.join(fs.realpathSync(e.cwd), '.claude', 'rules')}; checking the user-level copies at ${e.user} against ${e.src}`,
    );
    expect(r.text).toContain(`1 rule(s) match the shipped copies at ${e.user}`);
    expect(r.text).not.toContain('[missing]');
  });

  test('a stale user copy is drift: exit 0, or 1 under --strict', () => {
    const e = setup();
    write(e.user, 'sk-a.md', 'old');
    const r = check(e);
    expect(r.code).toBe(0);
    expect(r.text).toContain('[stale] sk-a.md');
    expect(check(e, ['--strict']).code).toBe(1);
  });

  test('a repo rule overlapping by name still reports overlap in user mode', () => {
    const e = setup();
    write(e.user, 'sk-a.md', RULE_A);
    write(e.project, 'a.md', '# Something else\n');
    const r = check(e);
    expect(r.text).toContain('checking the user-level copies');
    expect(r.text).toContain('a.md overlaps sk-a.md on name');
  });

  test('with no user directory every shipped rule is missing against the user directory', () => {
    const e = setup();
    write(e.src, 'sk-b.md', RULE_B);
    const r = check(e);
    expect(r.code).toBe(0);
    const lines = r.text.split('\n');
    expect(lines).toContain(
      `no sk-* rules in ${path.join(fs.realpathSync(e.cwd), '.claude', 'rules')}; checking the user-level copies at ${e.user} against ${e.src}`,
    );
    expect(lines).toContain('[missing] sk-a.md');
    expect(lines).toContain('[missing] sk-b.md');
    expect(r.text).not.toContain('match the shipped copies');
  });

  test('user mode checks every shipped rule, including the plugin-only one', () => {
    const e = setup();
    write(e.src, PM, RULE_B);
    write(e.user, 'sk-a.md', RULE_A);
    const r = check(e);
    expect(r.text).toContain(`[missing] ${PM}`);
    write(e.user, PM, RULE_B);
    const ok = check(e, ['--strict']);
    expect(ok.code).toBe(0);
    expect(ok.text).toContain(
      `2 rule(s) match the shipped copies at ${e.user}`,
    );
  });

  test('a repo whose rules are the user rules prints no duplicate line', () => {
    const e = setup();
    const home = tmp();
    gitInit(home);
    write(path.join(home, '.claude', 'rules'), 'sk-a.md', RULE_A);
    const r = check({
      src: e.src,
      cwd: home,
      home: path.join(home, '.claude'),
    });
    expect(r.code).toBe(0);
    expect(r.text).not.toContain('also deliver');
    expect(r.text).not.toContain('checking the user-level copies');
  });

  test('project copies also at user level print the duplicate line with the count', () => {
    const e = setup();
    write(e.src, 'sk-b.md', RULE_B);
    write(e.project, 'sk-a.md', RULE_A);
    write(e.project, 'sk-b.md', RULE_B);
    write(e.user, 'sk-a.md', RULE_A);
    const r = check(e, ['--strict']);
    expect(r.code).toBe(0);
    expect(r.text).toContain(
      `your user-level rules at ${e.user} also deliver 1 of these; Claude Code loads both copies here, which is expected where the repo keeps copies for colleagues without sidekick`,
    );
    expect(r.text).not.toContain('checking the user-level copies');
  });

  test('user copies never mask a partial project install', () => {
    const e = setup();
    write(e.src, 'sk-b.md', RULE_B);
    write(e.project, 'sk-a.md', RULE_A);
    write(e.user, 'sk-a.md', RULE_A);
    write(e.user, 'sk-b.md', RULE_B);
    const r = check(e);
    expect(r.text).toContain('[missing] sk-b.md');
    expect(r.text).not.toContain('checking the user-level copies');
  });
});

describe('runRulesCli arguments', () => {
  const run = (args: string[]) => {
    const src = tmp();
    const cwd = tmp();
    const home = tmp();
    gitInit(cwd);
    write(src, 'sk-a.md', RULE_A);
    write(path.join(cwd, '.claude', 'rules'), 'sk-a.md', 'drifted');
    const lines: string[] = [];
    const code = runRulesCli(args, { src, cwd, claudeHome: home }, (l) =>
      lines.push(l),
    );
    return { code, text: lines.join('\n') };
  };

  test('a misspelt flag prints the usage and exits 1, so it cannot disable --strict', () => {
    const r = run(['check', '--project', '--strikt']);
    expect(r.code).toBe(1);
    expect(r.text).toContain('usage: sidekick rules');
    expect(run(['check', '--project', '--strict']).code).toBe(1);
  });

  test('both scopes together print the usage and exit 1', () => {
    const r = run(['check', '--project', '--user']);
    expect(r.code).toBe(1);
    expect(r.text).toContain('usage: sidekick rules');
  });
});

describe('runRulesCli delivery mode and duplicates', () => {
  const setup = () => {
    const src = tmp();
    const cwd = tmp();
    const home = tmp();
    gitInit(cwd);
    write(src, 'sk-a.md', RULE_A);
    return {
      src,
      cwd,
      home,
      user: path.join(home, 'rules'),
      project: path.join(cwd, '.claude', 'rules'),
    };
  };
  const run = (verb: string, e: { src: string; cwd: string; home: string }) => {
    const lines: string[] = [];
    const code = runRulesCli(
      [verb, '--project'],
      { src: e.src, cwd: e.cwd, claudeHome: e.home },
      (l) => lines.push(l),
    );
    return { code, text: lines.join('\n') };
  };

  test('an install whose shipped names are all symlinks checks the project directory, not the user level', () => {
    const e = setup();
    const target = path.join(tmp(), 'elsewhere.md');
    fs.writeFileSync(target, RULE_A);
    fs.mkdirSync(e.project, { recursive: true });
    fs.symlinkSync(target, path.join(e.project, 'sk-a.md'));
    write(e.user, 'sk-a.md', RULE_A);
    const r = run('install', e);
    expect(r.text).toContain('[skipped:not-a-regular-file] sk-a.md');
    expect(r.text).not.toContain('checking the user-level copies');
    expect(r.text).toMatch(
      /1 rule\(s\) match the shipped copies at .*\.claude\/rules/,
    );
  });

  test('the duplicate line counts only rules the project expects', () => {
    const e = setup();
    write(e.src, PM, RULE_B);
    write(e.project, 'sk-a.md', RULE_A);
    write(e.project, PM, RULE_B);
    write(e.user, 'sk-a.md', RULE_A);
    write(e.user, PM, RULE_B);
    const r = run('check', e);
    expect(r.text).toContain('[orphaned] sk-pm-conventions.md');
    expect(r.text).toContain('also deliver 1 of these');
  });

  test('a plain file at the user rules path refuses a user-mode check', () => {
    const e = setup();
    write(e.home, 'rules', 'not a directory');
    const r = run('check', e);
    expect(r.code).toBe(1);
    expect(r.text).toContain(`${e.user} exists and is not a directory`);
    expect(r.text).not.toContain('[missing]');
  });
});
