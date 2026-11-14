import * as path from 'node:path';
import { realPathOf } from './sidekick-home.js';

/** The three rule lists of a loop's mandate: reads, a class's allow, and never. */
export type RuleList = 'reads' | 'allow' | 'never';

/** A permission rule split into its tool name and optional specifier. */
export interface ParsedRule {
  tool: string;
  specifier: string | undefined;
}

/** The shells, interpreters, runners, and wrappers whose rules need a script path. */
export const RUNNER_WORDS: readonly string[] = [
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
];

// Runners that run only a named file and read no config from the working folder.
const NO_FOLLOW = [
  'bun',
  'deno',
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'bunx',
  'make',
  'eval',
  'expect',
  'tclsh',
];

/** Folders a worker or the sandbox writes, so a program there is worker code. */
const SCRATCH_ROOTS: readonly string[] = [
  '/tmp',
  '/private/tmp',
  '/var/folders',
  '/private/var/folders',
  '/dev',
];

const GIT_RUNS_CODE = [
  'config',
  'rebase',
  'bisect',
  'submodule',
  'filter-branch',
  'difftool',
  'mergetool',
];
const GIT_NETWORK = [
  'fetch',
  'pull',
  'clone',
  'ls-remote',
  'push',
  'archive',
  'grep',
];
const GIT_CODE_OPTIONS = [
  '--upload-pack',
  '--receive-pack',
  '--exec',
  '--open-files-in-pager',
];
const WRITE_TOOLS = ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'];

const RULE_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*(?:\*)?)(?:\(([\s\S]+)\))?$/;
const PATH_TOOLS = ['Write', 'NotebookEdit', 'MultiEdit', 'Glob', 'Grep'];
const SYNTAX_PATTERN = /\$\(|`|<\(|>\(|[;|&\n]/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const UNPLAIN_WORD = /['"\\${}]/;
const WILDCARD = '*';
// The shell expands ? and [...] as well, so they count wherever a word is tested.
const GLOB_CHARS = /[*?[\]]/;
const GRAMMAR_CHARS = /[<>()!]/;
// Monitor and PowerShell take Bash's rule syntax and run through a shell.
const COMMAND_TOOLS = ['Bash', 'Monitor', 'PowerShell'];
const hasGlob = (word: string): boolean => GLOB_CHARS.test(word);
const hasDotSegment = (word: string): boolean =>
  word.split('/').some((s) => s === '.' || s === '..');
const DOT_ISSUE =
  'a path with . or .. segments is resolved before links are followed, so spell the path without . or .. segments.';

/** Parses `Tool` or `Tool(specifier)`; undefined for anything else. */
export function parseRule(text: string): ParsedRule | undefined {
  const m = RULE_PATTERN.exec(text);
  if (m?.[1] === undefined) return undefined;
  return { tool: m[1], specifier: m[2] };
}

const insideRepo = (script: string, repo: string): boolean => {
  const real = realPathOf(script);
  const root = realPathOf(repo);
  return real === root || real.startsWith(root + path.sep);
};

const isScratch = (p: string, roots: readonly string[]): boolean =>
  [path.resolve(p), realPathOf(p)].some((c) =>
    roots.some((r) => c === r || c.startsWith(r + path.sep)),
  );

const SCRATCH_ISSUE =
  'a program in a worker-writable folder (/tmp, /var/folders, /dev) is worker code, so use a path outside them.';

// A runner name, or a runner followed by a version suffix such as python3.12.
const runnerBase = (name: string): string | undefined => {
  if (RUNNER_WORDS.includes(name)) return name;
  const base = name.replace(/[0-9.]+$/, '');
  return base !== name && RUNNER_WORDS.includes(base) ? base : undefined;
};

const runsCodeOption = (word: string): boolean => {
  // -O is case-sensitive: -o is a different option.
  if (/^-[^-]*O/.test(word)) return true;
  if (!word.startsWith('--')) return false;
  const long = word.split('=')[0] ?? word;
  return long.length > 2 && GIT_CODE_OPTIONS.some((o) => o.startsWith(long));
};

const pathToolIssues = (rule: ParsedRule, list: RuleList): string[] => {
  const { tool, specifier } = rule;
  const bare = specifier === undefined || specifier === WILDCARD;
  if (list !== 'never' && bare && WRITE_TOOLS.includes(tool)) {
    return [
      'a loop writes only its record, through sidekick loop record, so scope the rule as Edit(//<path>/**) if a write is needed.',
    ];
  }
  if (specifier === undefined || specifier === WILDCARD) return [];
  if (PATH_TOOLS.includes(tool)) {
    return [
      `a ${tool} rule with a path never matches, so write ${tool} or ${tool}(*) instead.`,
    ];
  }
  if ((tool === 'Read' || tool === 'Edit') && /^\/(?!\/)/.test(specifier)) {
    return [
      `a ${tool} path with one slash anchors at the settings source, so write // before an absolute path, or ~/ for home.`,
    ];
  }
  return [];
};

/** What the judge knows of the loop: its repo and the folders workers write. */
interface Where {
  repo: string;
  scratch: readonly string[];
}

/** Whether `script` is an absolute path, wildcard-free, outside the repo and the scratch folders. */
const isOutsideScript = (script: string | undefined, where: Where): boolean =>
  script !== undefined &&
  path.isAbsolute(script) &&
  !hasGlob(script) &&
  !hasDotSegment(script) &&
  !insideRepo(script, where.repo) &&
  !isScratch(script, where.scratch);

const SCRIPT_ADVICE =
  'give the absolute path of a script outside the loop repo, with no wildcard, or grant the program it runs';

const commandPathIssues = (word: string, where: Where): string[] => {
  if (word.startsWith('~')) {
    return [
      'a command path starting with ~ is not expanded, so spell the path absolute.',
    ];
  }
  if (!path.isAbsolute(word)) {
    return [
      'a relative command path anchors in the loop worktree of the repo, so spell an absolute path outside the repo.',
    ];
  }
  if (hasDotSegment(word)) return [DOT_ISSUE];
  if (insideRepo(word, where.repo)) {
    return [
      'a command inside the repo is code a worker can write, so use an absolute path outside the repo.',
    ];
  }
  return isScratch(word, where.scratch) ? [SCRATCH_ISSUE] : [];
};

const gitIssues = (rest: string[]): string[] => {
  const [next] = rest;
  if (next === undefined) return [];
  if (next.startsWith('-') || hasGlob(next)) {
    return [
      'a git rule must name its subcommand with no option before it and no wildcard in it, since a leading option can set config or the exec path, which runs code.',
    ];
  }
  if (GIT_RUNS_CODE.includes(next)) {
    return [
      `git ${next} can run code of its own, so grant a different subcommand.`,
    ];
  }
  if (rest.some(runsCodeOption)) {
    return [
      'a git option such as -O, --upload-pack, --receive-pack, --exec, or --open-files-in-pager runs a command, so drop it from the rule.',
    ];
  }
  if (GIT_NETWORK.includes(next) && rest.slice(1).some(hasGlob)) {
    return [
      `a wildcard after git ${next} admits options that run code, so name the options the rule needs instead.`,
    ];
  }
  return [];
};

const programIssues = (name: string, rest: string[]): string[] => {
  const [next] = rest;
  if (name === 'claude') {
    return [
      'a claude rule starts a Claude session, so grant a narrower command.',
    ];
  }
  if (name === 'sidekick') {
    const launch =
      next === 'profile' &&
      rest[1] !== undefined &&
      (rest[1] === 'launch' || hasGlob(rest[1]));
    const bad =
      launch ||
      (next !== undefined &&
        (next === 'worker' || hasGlob(next) || next.startsWith('-')));
    return bad
      ? [
          'a sidekick rule must name its subcommand without a wildcard or leading option, and never worker or profile launch, which start sessions.',
        ]
      : [];
  }
  if (name === 'git') return gitIssues(rest);
  if (name === 'gh') {
    const bad =
      next !== undefined &&
      (hasGlob(next) ||
        next.startsWith('-') ||
        next === 'extension' ||
        next === 'alias');
    return bad
      ? [
          'a gh rule must name its subcommand with no leading option and no wildcard, and never extension or alias, which run code.',
        ]
      : [];
  }
  return [];
};

// A runner's absolute script is judged as a command of its own, so `env /bin/sh` refuses.
function runnerIssues(words: string[], name: string, where: Where): string[] {
  const base = runnerBase(name);
  if (base === undefined) return [];
  const next = words[1];
  if (!NO_FOLLOW.includes(base) && isOutsideScript(next, where)) {
    return commandIssues(words.slice(1), where);
  }
  if (next !== undefined && path.isAbsolute(next)) {
    if (hasDotSegment(next)) return [DOT_ISSUE];
    if (!hasGlob(next) && isScratch(next, where.scratch)) {
      return [SCRATCH_ISSUE];
    }
  }
  return [
    `a rule starting with a shell, interpreter, runner, or wrapper grants arbitrary code, so ${SCRIPT_ADVICE}.`,
  ];
}

/** Judges `words`, which start at a command word. */
function commandIssues(words: string[], where: Where): string[] {
  const [word = '', next] = words;
  if ([word, next].some((w) => w !== undefined && UNPLAIN_WORD.test(w))) {
    return [
      'quotes, backslashes, braces, and $ in the command words hide the program from the check, so spell them plainly.',
    ];
  }
  const pathIssues =
    word.includes('/') || word.startsWith('~')
      ? commandPathIssues(word, where)
      : [];
  // Lower case, since the default macOS volume resolves BASH to bash.
  const name = path.basename(word).toLowerCase();
  return [
    ...pathIssues,
    ...programIssues(name, words.slice(1)),
    ...runnerIssues(words, name, where),
  ];
}

const bashIssues = (specifier: string | undefined, where: Where): string[] => {
  if (specifier === undefined || specifier === WILDCARD) {
    return [
      'a Bash, Monitor, or PowerShell rule must name a command, since the bare tool or (*) matches every command.',
    ];
  }
  const issues = SYNTAX_PATTERN.test(specifier)
    ? [
        'a command substitution, process substitution, ;, |, &, or newline chains commands the check cannot see, so write one rule per command.',
      ]
    : [];
  const words = specifier.trim().split(/\s+/);
  // Quoting inside a rule is out of scope: words split on whitespace alone.
  const found = words.findIndex((w) => !ASSIGNMENT.test(w));
  const commandAt = found < 0 ? words.length : found;
  if (commandAt > 0) {
    issues.push(
      'a NAME=value word can change what a program loads, so write the rule without it.',
    );
  }
  if (found < 0 || words[commandAt] === '') {
    return [
      ...issues,
      'a rule must name a command after any NAME=value words.',
    ];
  }
  const head = words.slice(0, commandAt + 1);
  if (head.some(hasGlob)) {
    return [
      ...issues,
      'a wildcard (*, ?, or [...]) before or in the command word could match any program, so spell the command out.',
    ];
  }
  if (head.some((w) => GRAMMAR_CHARS.test(w))) {
    return [
      ...issues,
      'a redirect, parenthesis, or ! before or in the command word is shell grammar the check cannot judge, so start the rule with the command.',
    ];
  }
  if (words.slice(0, commandAt).some((w) => UNPLAIN_WORD.test(w))) {
    return [
      ...issues,
      'quotes, backslashes, braces, and $ in the command words hide the program from the check, so spell them plainly.',
    ];
  }
  return [...issues, ...commandIssues(words.slice(commandAt), where)];
};

/**
 * Why a rule cannot stand in `list`, one sentence per reason; empty when it
 * passes. Path-rule faults apply to every list, and `Bash` refusals to
 * `reads` and `allow` only, since a deny that matches more denies more.
 * `scratchRoots` is the set of folders workers write; tests narrow it.
 */
export function ruleIssues(
  text: string,
  list: RuleList,
  repo: string,
  scratchRoots: readonly string[] = SCRATCH_ROOTS,
): string[] {
  const rule = parseRule(text);
  if (rule === undefined) {
    return ['the rule does not parse as Tool or Tool(specifier).'];
  }
  const issues = pathToolIssues(rule, list);
  if (!COMMAND_TOOLS.includes(rule.tool) || list === 'never') return issues;
  return [
    ...issues,
    ...bashIssues(rule.specifier, { repo, scratch: scratchRoots }),
  ];
}
