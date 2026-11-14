import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  parseRule,
  RUNNER_WORDS,
  type RuleList,
  ruleIssues,
} from './loop-rules.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-rules-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ALL: RuleList[] = ['reads', 'allow', 'never'];
const WORK: RuleList[] = ['reads', 'allow'];
const REPO = '/Users/someone/elsewhere/repo';

type Row = [rule: string, lists: RuleList[], refused: boolean];

const REFUSED_ALL = [
  'Write(/a/**)',
  'Write(//a/**)',
  'NotebookEdit(//a/**)',
  'MultiEdit(//a/**)',
  'Glob(//a/**)',
  'Grep(src/**)',
  'Read(/a/**)',
  'Edit(/a/**)',
  'Bash(x',
  'Bash()',
  'Bash(x) y',
  '',
  '1Bash',
  'Bash x',
];
const PASSING_ALL = [
  'Write',
  'Write(*)',
  'Grep',
  'Edit(//Users/me/x/**)',
  'Read(//Users/me/x/**)',
  'Read(~/x)',
];
// Each refused in reads and allow; the parseable ones pass in never.
const REFUSED_WORK = [
  'Bash',
  'Bash(*)',
  'Bash(s*)',
  'Bash(:*)',
  'Bash(bash -c *)',
  'Bash(bash -lc *)',
  'Bash(python3 -u -c *)',
  'Bash(npx --yes *)',
  'Bash(env -i *)',
  'Bash(xargs -I{} *)',
  'Bash(FOO=1 sh -c *)',
  'Bash(FOO=1)',
  'Bash(bun run test)',
  'Bash(npm run test:*)',
  'Bash(claude respawn *)',
  'Bash(/usr/local/bin/claude respawn *)',
  'Bash(sidekick worker dispatch *)',
  'Bash(sidekick *)',
  'Bash(sidekick wor*)',
  'Bash(sidekick --x worker dispatch)',
  'Bash(/usr/local/bin/sidekick worker dispatch)',
  'Bash(git *)',
  'Bash(git l*)',
  'Bash(git -c x=y log)',
  'Bash(git --config-env=x=y log)',
  'Bash(git --exec-path=/x log)',
  'Bash(git --exec-path)',
  'Bash(git -C dir -c x=y log)',
  'Bash(git -C dir log)',
  'Bash(/usr/bin/git -c x=y log)',
  'Bash(gh *)',
  'Bash(gh extension exec x)',
  'Bash(gh alias set x y)',
  'Bash(gh iss* view)',
  'Bash(eval /abs/x *)',
  'Bash(X=* git log)',
  'Bash(FOO=1 *)',
  'Bash(bash* -c x)',
  'Bash(env /bin/sh -c *)',
  'Bash(nohup /usr/local/bin/claude *)',
  'Bash(env /usr/bin/git -c x=y log)',
  'Bash(node /abs/plugin/bin/sidekick worker dispatch *)',
  'Bash(env /usr/bin/env /bin/sh -c x)',
  'Bash(env /usr/bin/gh extension exec x)',
  'Bash(sidekick worke? dispatch *)',
  'Bash(sidekick wor[k]er dispatch)',
  'Bash(ba?h -c *)',
  'Bash(b[a]sh -c *)',
  'Bash(git l[o]g)',
  'Bash(git l?g)',
  'Bash(gh iss?e view)',
  'Bash(node /Users/me/x[1].js)',
  'Bash(node /Users/me/x?.js)',
  'Monitor',
  'Monitor(*)',
  'Monitor(bash -c *)',
  'PowerShell',
  'PowerShell(*)',
  'PowerShell(bash -c *)',
  'Bash(2>x bash -c *)',
  'Bash(<x sh -c *)',
  'Bash(! bash -c *)',
  'Bash((bash -c *))',
  'Bash(FOO=(x) git log)',
  'Bash(node /Users/me/a/../x.js)',
  'Bash(node /Users/me/./x.js)',
  'Bash(/Users/me/./tool *)',
  'Bash(/Users/me/a/../tool *)',
  'Bash(env /Users/me/a/../x *)',
  'Bash(BASH -c *)',
  'Bash(Git -c x=y log)',
  'Bash(CLAUDE respawn)',
  'Bash(/usr/bin/NODE -e x)',
  'Bash("bash" -c *)',
  "Bash('sh' -c *)",
  'Bash($SHELL -c *)',
  'Bash(\\bash -c *)',
  'Bash(git "-c" x=y log)',
  'Bash(FOO="a" git log)',
  'Bash(gh -R x extension exec y)',
  'Bash(   )',
  'Bash(./x.sh *)',
  'Bash(bin/x *)',
  'Bash(~/x.sh *)',
  'Bash(~root/x.sh)',
  'Bash(/Users/*/x.sh)',
  'Bash(/usr/bin/bash -c *)',
  'Bash(/usr/bin/env -i /abs/x)',
  'Bash(node /Users/someone/x/../elsewhere/repo/x.js)',
  'Bash(node ./x.js)',
  'Bash(node ~/x.js)',
  'Bash(node /abs/*.js)',
  'Bash(node -e x)',
  'Bash(node)',
  'Bash(bash /abs/x.sh; rm x)',
  'Bash(gh issue view $(rm x))',
  'Bash(gh issue view `x`)',
  'Bash(cat <(x))',
  'Bash(cat >(x))',
  'Bash(gh issue view 1 | sh)',
  'Bash(gh issue view 1 & x)',
  'Bash(gh issue view 1 && x)',
  'Bash(gh issue view 1\nx)',
];
const PASSING_WORK = [
  'Bash(gh issue view *)',
  'Bash(git log *)',
  'Bash(git)',
  'Bash(sidekick loop record fixer *)',
  'Bash(sidekick)',
  'Bash(node /Users/me/.claude/sidekick/profiles/fixer/plugin/bin/f.js *)',
  'Bash(FOO=1 node /Users/me/f.js)',
  'Bash(/Users/me/bin/tool *)',
  'Bash(env /Users/me/outside/tool *)',
  'Bash(node /Users/me/outside/x.js *)',
  'Bash(env /usr/bin/git log *)',
  'Monitor(gh issue view *)',
  'PowerShell(Get-Date)',
  'Bash(/usr/bin/git log *)',
  'mcp__plugin_x_y__z',
  'mcp__server__*',
  'WebFetch(domain:github.com)',
];

const rows: Row[] = [
  ...REFUSED_ALL.map((r): Row => [r, ALL, true]),
  ...PASSING_ALL.map((r): Row => [r, ALL, false]),
  ...REFUSED_WORK.map((r): Row => [r, WORK, true]),
  ...REFUSED_WORK.map((r): Row => [r, ['never'], false]),
  ...PASSING_WORK.map((r): Row => [r, ['reads', 'allow', 'never'], false]),
];

describe('parseRule', () => {
  test('parses a bare tool and a tool with a specifier', () => {
    expect(parseRule('Write')).toEqual({ tool: 'Write', specifier: undefined });
    expect(parseRule('Bash(git log *)')).toEqual({
      tool: 'Bash',
      specifier: 'git log *',
    });
    expect(parseRule('mcp__s__*')).toEqual({
      tool: 'mcp__s__*',
      specifier: undefined,
    });
    expect(parseRule('mcp__s__t')).toEqual({
      tool: 'mcp__s__t',
      specifier: undefined,
    });
  });
  test('refuses an open paren, an empty specifier, and trailing text', () => {
    expect(parseRule('Bash(x')).toBeUndefined();
    expect(parseRule('Bash()')).toBeUndefined();
    expect(parseRule('Bash(x) y')).toBeUndefined();
    expect(parseRule('')).toBeUndefined();
  });
});

describe('RUNNER_WORDS', () => {
  test('lists the spec words in order', () => {
    expect([...RUNNER_WORDS]).toEqual([
      'sh',
      'bash',
      'zsh',
      'fish',
      'dash',
      'ksh',
      'python',
      'python3',
      'node',
      'bun',
      'deno',
      'ruby',
      'perl',
      'php',
      'lua',
      'osascript',
      'eval',
      'exec',
      'env',
      'xargs',
      'sudo',
      'nohup',
      'timeout',
      'nice',
      'command',
      'source',
      '.',
      'npx',
      'bunx',
      'npm',
      'pnpm',
      'yarn',
      'make',
    ]);
  });
});

describe('ruleIssues', () => {
  test.each(rows)('%s in %j', (rule, lists, refused) => {
    for (const list of lists) {
      const issues = ruleIssues(rule, list, REPO);
      if (refused) expect(issues.length).toBeGreaterThan(0);
      else expect(issues).toEqual([]);
    }
  });

  test('an issue is a sentence that does not repeat the rule', () => {
    const issues = ruleIssues('Bash(bash -c *)', 'allow', REPO);
    expect(issues.length).toBe(1);
    expect(issues[0]).not.toContain('bash -c');
    expect(issues[0]).toContain('shell');
  });
  test('a tilde command word says to spell it absolute', () => {
    expect(ruleIssues('Bash(~/x.sh *)', 'allow', REPO).join(' ')).toContain(
      'absolute',
    );
  });
  test('shell syntax says to write one rule per command', () => {
    expect(
      ruleIssues('Bash(gh issue view 1 | x)', 'reads', REPO).join(' '),
    ).toContain('one rule per command');
  });

  describe('a script inside repo', () => {
    const repoIn = (): string => {
      const repo = path.join(tmp, 'repo');
      fs.mkdirSync(repo);
      return repo;
    };
    test('refuses an absolute script path inside repo', () => {
      const repo = repoIn();
      expect(
        ruleIssues(`Bash(node ${repo}/x.js *)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
      expect(
        ruleIssues(`Bash(${repo}/x.sh *)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
      expect(
        ruleIssues(`Bash(node ${tmp}/other/x.js *)`, 'allow', repo),
      ).toEqual([]);
    });
    test('refuses a script reached through a link, both ways', () => {
      const repo = repoIn();
      const link = path.join(tmp, 'link');
      fs.symlinkSync(repo, link);
      expect(
        ruleIssues(`Bash(node ${repo}/x.js)`, 'allow', link).length,
      ).toBeGreaterThan(0);
      expect(
        ruleIssues(`Bash(node ${link}/x.js)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
      expect(
        ruleIssues(`Bash(${link}/x.sh)`, 'reads', repo).length,
      ).toBeGreaterThan(0);
    });
    test('refuses a script reached by .. segments', () => {
      const repo = repoIn();
      fs.mkdirSync(path.join(tmp, 'o'));
      expect(
        ruleIssues(`Bash(node ${tmp}/o/../repo/x.js)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
    });
    test('refuses shell glob characters that could expand into repo', () => {
      const repo = repoIn();
      expect(
        ruleIssues(`Bash(node ${tmp}/rep?/x.js)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
      expect(
        ruleIssues(`Bash(${tmp}/[r]epo/x.js *)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
    });
    test('refuses .. after a link, which the kernel follows first', () => {
      const repo = repoIn();
      fs.mkdirSync(path.join(repo, 'sub'));
      fs.mkdirSync(path.join(tmp, 'out'));
      fs.symlinkSync(path.join(repo, 'sub'), path.join(tmp, 'out', 'l'));
      const issues = ruleIssues(
        `Bash(node ${tmp}/out/l/../x.js)`,
        'allow',
        repo,
      );
      expect(issues.join(' ')).toContain('without . or ..');
      expect(
        ruleIssues(`Bash(${tmp}/out/l/../x.sh)`, 'allow', repo).join(' '),
      ).toContain('without . or ..');
    });
    test('a sibling folder sharing the repo name prefix passes', () => {
      const repo = repoIn();
      expect(ruleIssues(`Bash(node ${repo}-two/x.js)`, 'allow', repo)).toEqual(
        [],
      );
    });
  });
});
