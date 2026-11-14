import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import {
  parseRule,
  RUNNER_WORDS,
  type RuleList,
  ruleIssues,
} from './loop-rules.js';

const LOOPS_DOC = path.join(
  import.meta.dir,
  '..',
  '..',
  'plugin/skills/sidekick/references/loops.md',
);

type MdNode = ReturnType<typeof fromMarkdown>['children'][number];

const codeSpans = (node: MdNode): string[] => [
  ...(node.type === 'inlineCode' ? [node.value] : []),
  ...('children' in node ? node.children.flatMap(codeSpans) : []),
];

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
  'Write',
  'Write(*)',
  'Edit',
  'Edit(*)',
  'NotebookEdit',
  'NotebookEdit(*)',
  'MultiEdit',
  'MultiEdit(*)',
  'Bash(FOO=1 node /Users/me/f.js)',
  'Bash(FOO=1 git log)',
  'Monitor(FOO=1 git log)',
  'PowerShell(FOO=1 Get-Date)',
  'Bash(csh -c *)',
  'Bash(tcsh -c x)',
  'Bash(time git log)',
  'Bash(builtin x)',
  'Bash(stdbuf -o0 x)',
  'Bash(noglob x)',
  'Bash(coproc bash -c *)',
  'Bash(xcrun x)',
  'Bash(caffeinate x)',
  'Bash(arch -x86_64 x)',
  'Bash(script x)',
  'Bash(expect -c x)',
  'Bash(tclsh x)',
  'Bash(python3.12 -c *)',
  'Bash(ruby3.3 -e x)',
  'Bash(perl5.34 -e x)',
  'Bash(node22 -e x)',
  'Bash(/usr/bin/python3.12 -c x)',
  'Bash(sidekick profile launch x)',
  'Bash(sidekick profile *)',
  'Bash(bun /Users/me/x.ts)',
  'Bash(deno /Users/me/x.ts)',
  'Bash(npm /Users/me/x)',
  'Bash(npx /Users/me/x)',
  'Bash(yarn /Users/me/x)',
  'Bash(pnpm /Users/me/x)',
  'Bash(bunx /Users/me/x)',
  'Bash(make /Users/me/x)',
  'Bash(expect /Users/me/x.exp)',
  'Bash(tclsh /Users/me/x.tcl)',
  'Bash(node /tmp/x.js)',
  'Bash(node /private/tmp/x.js)',
  'Bash(node /var/folders/ab/x.js)',
  'Bash(node /private/var/folders/ab/x.js)',
  'Bash(node /dev/shm/x.js)',
  'Bash(/tmp/tool *)',
  'Bash(env /tmp/tool *)',
  'Bash(git config *)',
  'Bash(git config user.name)',
  'Bash(git rebase *)',
  'Bash(git bisect run x)',
  'Bash(git submodule *)',
  'Bash(git filter-branch *)',
  'Bash(git difftool *)',
  'Bash(git mergetool)',
  'Bash(git grep -Ocmd x)',
  'Bash(git log -Ofoo)',
  'Bash(git grep -iOless x)',
  'Bash(git log --upload-pack=x)',
  'Bash(git log --receive-pack x)',
  'Bash(git log --exec=x)',
  'Bash(git log --exec x)',
  'Bash(git log --open-files-in-pager=x)',
  'Bash(git log --upload-p=x)',
  'Bash(git fetch *)',
  'Bash(git fetch origin *)',
  'Bash(git pull *)',
  'Bash(git clone *)',
  'Bash(git ls-remote *)',
  'Bash(git push *)',
  'Bash(git archive *)',
  'Bash(git grep *)',
  'Bash(sidekick "worker" dispatch *)',
  'Bash(gh "extension" exec x)',
  'Bash(env "/bin/sh" -c x)',
  'Bash(node /Users/me/f.js $(rm x))',
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
  // A NAME+=value word is a prefix assignment, as NAME=value is.
  'Bash(FOO+=1 bash -c *)',
  'Bash(X+=1 sh -c *)',
  'Bash(FOO+=1 git log)',
  'Bash(FOO+=1)',
  'Monitor(FOO+=1 bash -c *)',
  'PowerShell(FOO+=1 bash -c *)',
  // Subcommand and long option words compare in lower case.
  'Bash(git MERGETOOL --tool-help)',
  'Bash(git FILTER-BRANCH -h)',
  'Bash(git Config user.name)',
  'Bash(git FETCH *)',
  'Bash(git LOG *)',
  'Bash(git log --UPLOAD-PACK=x)',
  'Bash(git log --Exec=x)',
  'Bash(git log --OUTPUT=x)',
  'Bash(git CLONE -u x y)',
  'Bash(gh EXTENSION exec x)',
  'Bash(gh Alias set x y)',
  'Bash(sidekick WORKER dispatch)',
  'Bash(sidekick PROFILE launch x)',
  'Bash(sidekick profile LAUNCH x)',
  // Quoting, escapes, and braces in a word a check reads hide it from the check.
  'Bash(sidekick profile "launch" x)',
  'Bash(sidekick profile la\\unch x)',
  'Bash(git log --upload-"pack"=x)',
  'Bash(git log --up\\load-pack=x)',
  'Bash(git log --out{put,x}=y)',
  'Bash(git clone -"u" x y)',
  'Bash(find /Users/me -e"xec" x +)',
  'Bash(rg --pr"e" x y)',
  'Bash(fd --e"xec" x)',
  // Paths compare with the repo and the scratch folders without case.
  'Bash(node /Users/someone/Elsewhere/REPO/x.js)',
  'Bash(/USERS/someone/elsewhere/repo/tool *)',
  'Bash(node /PRIVATE/TMP/nonexistent-sk/x.js)',
  'Bash(node /private/TMP/x.js)',
  'Bash(/private/TMP/tool *)',
  'Bash(node /Users/SHARED/x.js)',
  // script's first operand is its output file, so it takes no script path.
  'Bash(script /Users/me/outside/log *)',
  'Bash(script /Users/me/outside/log)',
  'Bash(env /usr/bin/script /Users/me/l bash -c x)',
  // A write rule names a // path whose first folder holds no wildcard.
  'Edit(**)',
  'Edit(//**)',
  'Edit(//*/x/**)',
  'Edit(//U*/me/**)',
  'Edit(//?sers/me/**)',
  'Edit(//[U]sers/me/**)',
  'Edit(///x/**)',
  'Edit(~/**)',
  'Edit(~/x/**)',
  'Edit(./**)',
  'Edit(src/**)',
  'Edit(//Users/../**)',
  'Edit(//Users/me/./x/**)',
  // More folders any local process can write.
  'Bash(node /private/var/tmp/x.js)',
  'Bash(node /var/tmp/x.js)',
  'Bash(/Users/Shared/tool *)',
  'Bash(node /Users/Shared/x.js)',
  'Bash(env /Users/Shared/t)',
  // git clone -u is --upload-pack.
  'Bash(git clone -u x y)',
  'Bash(git clone -ux y)',
  'Bash(git clone -qu x y)',
  'Bash(git clone --upload-pack=x y)',
  // git --output writes a file, and a wildcard after these subcommands admits it.
  'Bash(git log *)',
  'Bash(git diff *)',
  'Bash(git show *)',
  'Bash(git format-patch *)',
  'Bash(git log -p *)',
  'Bash(git log --output=x)',
  'Bash(git log --output x)',
  'Bash(git diff --output=/Users/me/x)',
  'Bash(git status --output=x)',
  'Bash(git log --outp=x)',
  'Bash(env /usr/bin/git log *)',
  'Bash(/usr/bin/git log *)',
  // More interpreters and wrappers.
  'Bash(pypy -c x)',
  'Bash(pypy3 -c x)',
  'Bash(pypy3 /Users/me/x.py)',
  'Bash(pypy3.10 -c x)',
  'Bash(awk x)',
  'Bash(gawk -f /Users/me/x.awk)',
  'Bash(nawk x)',
  'Bash(trap x EXIT)',
  'Bash(nocorrect x)',
  'Bash(gtimeout 5 x)',
  'Bash(genv -i x)',
  'Bash(genv /bin/sh -c x)',
  'Bash(gxargs x)',
  'Bash(gnice x)',
  'Bash(gstdbuf -o0 x)',
  'Bash(gnohup x)',
  // find, rg, and fd run commands through options; tar and ssh refuse outright.
  'Bash(find /Users/me -exec x +)',
  'Bash(find /Users/me -execdir x +)',
  'Bash(find /Users/me -ok x)',
  'Bash(find /Users/me -okdir x)',
  'Bash(find /Users/me *)',
  'Bash(find /Users/me -name x?)',
  'Bash(find /Users/me -name [a]b)',
  'Bash(/usr/bin/find /Users/me -exec x +)',
  'Bash(env /usr/bin/find /Users/me -exec x +)',
  'Bash(FIND /Users/me -exec x +)',
  'Bash(rg --pre /bin/sh x)',
  'Bash(rg --pre=x y)',
  'Bash(rg foo *)',
  'Bash(rg fo? /Users/me)',
  'Bash(fd -x rm)',
  'Bash(fd -X rm)',
  'Bash(fd -Hx rm)',
  'Bash(fd --exec rm)',
  'Bash(fd --exec-batch rm)',
  'Bash(fd --exec=rm)',
  'Bash(fd foo *)',
  'Bash(fd fo?)',
  'Bash(tar -xf /Users/me/a.tar)',
  'Bash(tar)',
  'Bash(/usr/bin/tar -tf x)',
  'Bash(ssh host x)',
  'Bash(ssh)',
  'Bash(env /usr/bin/ssh host)',
  // macOS shows each firmlinked folder under /System/Volumes/Data too.
  'Bash(node /System/Volumes/Data/private/tmp/x.js)',
  'Bash(/System/Volumes/Data/private/tmp/tool *)',
  'Bash(env /System/Volumes/Data/private/tmp/tool *)',
  'Bash(node /System/Volumes/Data/Users/Shared/x.js)',
  'Bash(node /System/Volumes/Data/private/var/tmp/x.js)',
  'Bash(node /system/volumes/data/private/tmp/x.js)',
  'Bash(node /System/Volumes/Data/Users/someone/elsewhere/repo/bin/x.js)',
  'Bash(/SYSTEM/VOLUMES/DATA/Users/someone/elsewhere/repo/tool *)',
  // git's dashed programs are git under another name.
  'Bash(/Applications/Xcode.app/Contents/Developer/usr/libexec/git-core/git-log *)',
  'Bash(/Applications/Xcode.app/Contents/Developer/usr/libexec/git-core/git-config core.pager x)',
  'Bash(/Applications/Xcode.app/Contents/Developer/usr/libexec/git-core/git-mergetool --tool-help)',
  'Bash(/usr/libexec/git-core/git-status)',
  'Bash(git-log *)',
  'Bash(GIT-Config core.pager x)',
  'Bash(env /usr/libexec/git-core/git-log *)',
  'Bash(nohup /usr/libexec/git-core/git-mergetool)',
  'Monitor(git-log --oneline)',
];
const PASSING_WORK = [
  'Bash(gh issue view *)',
  'Bash(git log --oneline -20)',
  'Bash(git)',
  'Bash(sidekick loop record fixer *)',
  'Bash(sidekick)',
  'Bash(node /Users/me/.claude/sidekick/profiles/fixer/plugin/bin/f.js *)',
  'Bash(node /Users/me/f.js "a b")',
  'Bash(node /Users/me/f.js $HOME)',
  'Bash(env /Users/me/t {a,b})',
  'Bash(env /Users/me/outside/tool2 *)',
  'Bash(time /Users/me/outside/tool)',
  'Bash(python3.12 /Users/me/x.py)',
  'Bash(zsh /Users/me/x.sh)',
  'Bash(csh /Users/me/x.sh)',
  'Bash(node22 /Users/me/x.js)',
  'Bash(pythonista run)',
  'Bash(nodemon x)',
  'Bash(sidekick profile list)',
  'Bash(git status)',
  'Bash(git diff --stat)',
  'Bash(git show HEAD)',
  'Bash(git log --oneline)',
  'Bash(git log -o x)',
  'Bash(git fetch origin main)',
  'Bash(git grep foo)',
  'Bash(node /Users/me/tmp/x.js)',
  'Bash(node /tmpfoo/x.js)',
  'Edit(//Users/me/x)',
  'Bash(/Users/me/bin/tool *)',
  'Bash(env /Users/me/outside/tool *)',
  'Bash(node /Users/me/outside/x.js *)',
  'Bash(env /usr/bin/git log --oneline)',
  'Monitor(gh issue view *)',
  'PowerShell(Get-Date)',
  'Bash(/usr/bin/git log --oneline -20)',
  'mcp__plugin_x_y__z',
  'mcp__server__*',
  'WebFetch(domain:github.com)',
  // Kept: a case variant of a plain subcommand, and options that only look alike.
  'Bash(git STATUS)',
  'Bash(git log -u -1)',
  'Bash(git clone /Users/me/a /Users/me/b)',
  'Bash(node /Users/SharedStuff/x.js)',
  'Edit(//Users/me/x/*.ts)',
  'Bash(genv /Users/me/outside/tool)',
  'Bash(gnohup /Users/me/outside/tool)',
  'Bash(find /Users/me/x -name foo.ts)',
  'Bash(find /Users/me/x -executable)',
  'Bash(rg foo /Users/me/x)',
  'Bash(rg --pre-glob x foo)',
  'Bash(fd foo /Users/me/x)',
  'Bash(fd -H foo)',
  // Kept: an alias outside the repo and scratch, and programs whose names only start with git.
  'Bash(node /System/Volumes/Data/Users/me/outside/x.js)',
  'Bash(gitk --all)',
  'Bash(/usr/local/bin/gitk)',
  'Bash(github-cli x)',
  'Bash(env /usr/local/bin/gitk)',
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
      'csh',
      'tcsh',
      'time',
      'builtin',
      'stdbuf',
      'noglob',
      'coproc',
      'xcrun',
      'caffeinate',
      'arch',
      'script',
      'expect',
      'tclsh',
      'pypy',
      'pypy3',
      'awk',
      'gawk',
      'nawk',
      'trap',
      'nocorrect',
      'gtimeout',
      'genv',
      'gxargs',
      'gnice',
      'gstdbuf',
      'gnohup',
    ]);
  });

  test('references/loops.md names each word in a code span', () => {
    const doc = fs.readFileSync(LOOPS_DOC, 'utf8');
    const spans = new Set(fromMarkdown(doc).children.flatMap(codeSpans));
    expect(RUNNER_WORDS.filter((word) => !spans.has(word))).toEqual([]);
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
  test('a wildcard after git log says to name the options', () => {
    expect(ruleIssues('Bash(git log *)', 'allow', REPO).join(' ')).toContain(
      'name the options',
    );
  });
  test('a runner with no script exception does not ask for a script path', () => {
    const issues = ruleIssues('Bash(bun /Users/me/x.ts)', 'allow', REPO);
    expect(issues.join(' ')).toContain('grant the program');
    expect(issues.join(' ')).not.toContain('absolute path');
  });
  test('a dashed git program says to write git <subcommand>', () => {
    expect(
      ruleIssues('Bash(git-log --oneline)', 'allow', REPO).join(' '),
    ).toContain('git <subcommand>');
  });

  describe('an absolute path after a runner word', () => {
    // The script runners and wrappers the rulings name; every other runner word takes neither.
    const TAKES_A_PATH = new Set([
      'sh',
      'bash',
      'zsh',
      'fish',
      'dash',
      'ksh',
      'csh',
      'tcsh',
      'python',
      'python3',
      'node',
      'ruby',
      'perl',
      'php',
      'lua',
      'osascript',
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
      'time',
      'builtin',
      'stdbuf',
      'noglob',
      'coproc',
      'xcrun',
      'caffeinate',
      'arch',
      'gtimeout',
      'genv',
      'gxargs',
      'gnice',
      'gstdbuf',
      'gnohup',
    ]);
    test.each([...RUNNER_WORDS])('%s', (word) => {
      const rule = `Bash(${word} /Users/me/outside/tool)`;
      const issues = ruleIssues(rule, 'allow', REPO);
      if (TAKES_A_PATH.has(word)) expect(issues).toEqual([]);
      else expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('paths compare without case', () => {
    // No ancestor of these paths exists, so neither Bun nor Node folds their case.
    test('refuses a script in a case twin of the repo', () => {
      const repo = '/nonexistent-sk/Repo';
      expect(
        ruleIssues('Bash(node /nonexistent-sk/repo/x.js)', 'allow', repo, [])
          .length,
      ).toBeGreaterThan(0);
      expect(
        ruleIssues('Bash(/NONEXISTENT-SK/REPO/tool *)', 'reads', repo, [])
          .length,
      ).toBeGreaterThan(0);
      expect(
        ruleIssues(
          'Bash(node /nonexistent-sk/repo-two/x.js)',
          'allow',
          repo,
          [],
        ),
      ).toEqual([]);
    });
    test('refuses a script in a case twin of a scratch folder', () => {
      const roots = ['/nonexistent-sk/scratch'];
      const issues = (rule: string): string =>
        ruleIssues(rule, 'allow', REPO, roots).join(' ');
      expect(issues('Bash(node /NONEXISTENT-SK/Scratch/x.js)')).toContain(
        'writable',
      );
      expect(issues('Bash(/nonexistent-sk/SCRATCH/tool *)')).toContain(
        'writable',
      );
      expect(issues('Bash(node /nonexistent-sk/scratchy/x.js)')).toBe('');
    });
  });

  describe('a /System/Volumes/Data alias', () => {
    // Nothing below the Data volume's root exists here, so neither Bun nor Node folds the alias.
    test('refuses a script in the repo through the alias', () => {
      const repo = '/nonexistent-sk/repo';
      const issues = (rule: string, at = repo): string =>
        ruleIssues(rule, 'allow', at, []).join(' ');
      expect(
        issues('Bash(node /System/Volumes/Data/nonexistent-sk/repo/x.js)'),
      ).toContain('inside the repo');
      expect(
        issues('Bash(/system/volumes/DATA/nonexistent-sk/repo/tool *)'),
      ).toContain('inside the repo');
      expect(
        issues(
          'Bash(node /nonexistent-sk/repo/x.js)',
          '/System/Volumes/Data/nonexistent-sk/repo',
        ),
      ).toContain('inside the repo');
      expect(
        issues('Bash(node /System/Volumes/DataX/nonexistent-sk/repo/x.js)'),
      ).toBe('');
    });
    test('refuses a script in a scratch folder through the alias', () => {
      const issues = (rule: string, root = '/nonexistent-sk/scratch'): string =>
        ruleIssues(rule, 'allow', REPO, [root]).join(' ');
      expect(
        issues('Bash(node /System/Volumes/Data/nonexistent-sk/scratch/x.js)'),
      ).toContain('writable');
      expect(
        issues('Bash(/SYSTEM/Volumes/Data/nonexistent-sk/scratch/tool *)'),
      ).toContain('writable');
      expect(
        issues(
          'Bash(node /nonexistent-sk/scratch/x.js)',
          '/System/Volumes/Data/nonexistent-sk/scratch',
        ),
      ).toContain('writable');
      expect(
        issues('Bash(node /System/Volumes/Data/nonexistent-sk/scratchy/x.js)'),
      ).toBe('');
    });
  });

  describe('a script in a worker-writable folder', () => {
    test('refuses a script under the OS temp folder by default', () => {
      const repo = path.join(tmp, 'repo');
      fs.mkdirSync(repo);
      const other = path.join(tmp, 'other');
      expect(
        ruleIssues(`Bash(node ${other}/x.js)`, 'allow', repo).join(' '),
      ).toContain('writable');
      expect(ruleIssues(`Bash(${other}/tool)`, 'reads', repo).length).toBe(1);
    });
  });

  describe('a script inside repo', () => {
    // The temp folder holds these fixtures, so its own refusal is switched off.
    const noScratch = (rule: string, list: RuleList, repo: string): string[] =>
      ruleIssues(rule, list, repo, []);
    const repoIn = (): string => {
      const repo = path.join(tmp, 'repo');
      fs.mkdirSync(repo);
      return repo;
    };
    test('refuses an absolute script path inside repo', () => {
      const repo = repoIn();
      expect(
        noScratch(`Bash(node ${repo}/x.js *)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
      expect(
        noScratch(`Bash(${repo}/x.sh *)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
      expect(
        noScratch(`Bash(node ${tmp}/other/x.js *)`, 'allow', repo),
      ).toEqual([]);
    });
    test('refuses a script reached through a link, both ways', () => {
      const repo = repoIn();
      const link = path.join(tmp, 'link');
      fs.symlinkSync(repo, link);
      expect(
        noScratch(`Bash(node ${repo}/x.js)`, 'allow', link).length,
      ).toBeGreaterThan(0);
      expect(
        noScratch(`Bash(node ${link}/x.js)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
      expect(
        noScratch(`Bash(${link}/x.sh)`, 'reads', repo).length,
      ).toBeGreaterThan(0);
    });
    test('refuses a script reached by .. segments', () => {
      const repo = repoIn();
      fs.mkdirSync(path.join(tmp, 'o'));
      expect(
        noScratch(`Bash(node ${tmp}/o/../repo/x.js)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
    });
    test('refuses shell glob characters that could expand into repo', () => {
      const repo = repoIn();
      expect(
        noScratch(`Bash(node ${tmp}/rep?/x.js)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
      expect(
        noScratch(`Bash(${tmp}/[r]epo/x.js *)`, 'allow', repo).length,
      ).toBeGreaterThan(0);
    });
    test('refuses .. after a link, which the kernel follows first', () => {
      const repo = repoIn();
      fs.mkdirSync(path.join(repo, 'sub'));
      fs.mkdirSync(path.join(tmp, 'out'));
      fs.symlinkSync(path.join(repo, 'sub'), path.join(tmp, 'out', 'l'));
      const issues = noScratch(
        `Bash(node ${tmp}/out/l/../x.js)`,
        'allow',
        repo,
      );
      expect(issues.join(' ')).toContain('without . or ..');
      expect(
        noScratch(`Bash(${tmp}/out/l/../x.sh)`, 'allow', repo).join(' '),
      ).toContain('without . or ..');
    });
    test('a sibling folder sharing the repo name prefix passes', () => {
      const repo = repoIn();
      expect(noScratch(`Bash(node ${repo}-two/x.js)`, 'allow', repo)).toEqual(
        [],
      );
    });
  });
});
