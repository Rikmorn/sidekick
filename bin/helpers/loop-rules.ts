import * as path from 'node:path';
import { realPathOf } from './sidekick-home.js';

/** The three rule lists of a loop's mandate: reads, a class's allow, and never. */
export type RuleList = 'reads' | 'allow' | 'never';

/** A permission rule split into its tool name and optional specifier. */
export interface ParsedRule {
  tool: string;
  specifier: string | undefined;
}

/**
 * The shells, interpreters, runners, and wrappers a `Bash` rule may not start
 * with. Only a script runner or a wrapper whose next word is an absolute path
 * outside the repo passes, and that path is judged as a command of its own.
 */
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
];

// Runners that run the named file and read no config from the working folder.
const SCRIPT_RUNNERS: readonly string[] = [
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
];

// Wrappers that run their next word as a program; the g-prefixed ones are GNU twins.
const WRAPPERS: readonly string[] = [
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
];

// Folders any local process can write, so a program there may be worker code.
const SCRATCH_ROOTS: readonly string[] = [
  '/tmp',
  '/private/tmp',
  '/var/tmp',
  '/private/var/tmp',
  '/var/folders',
  '/private/var/folders',
  '/dev',
  '/Users/Shared',
];

// Tools whose path specifier never matches, so only the bare tool or (*) means anything.
const PATH_TOOLS: readonly string[] = [
  'Write',
  'NotebookEdit',
  'MultiEdit',
  'Glob',
  'Grep',
];

// Tools that write files, which a loop does only through its record.
const WRITE_TOOLS: readonly string[] = [
  'Write',
  'Edit',
  'NotebookEdit',
  'MultiEdit',
];

// Tools that take Bash's rule syntax and run through a shell.
const COMMAND_TOOLS: readonly string[] = ['Bash', 'Monitor', 'PowerShell'];

// git subcommands that run code of their own: hooks, tools, editors, or config.
const GIT_RUNS_CODE: readonly string[] = [
  'config',
  'rebase',
  'bisect',
  'submodule',
  'filter-branch',
  'difftool',
  'mergetool',
];

// git subcommands with an option that runs a command or writes a file.
const GIT_NAMED_OPTIONS: readonly string[] = [
  'fetch',
  'pull',
  'clone',
  'ls-remote',
  'push',
  'archive',
  'grep',
  'log',
  'diff',
  'show',
  'format-patch',
];

// git long options that run a command or write a file, refused in any git rule.
const GIT_CODE_OPTIONS: readonly string[] = [
  '--upload-pack',
  '--receive-pack',
  '--exec',
  '--open-files-in-pager',
  '--output',
];

// find primaries that run a command.
const FIND_RUNS_CODE: readonly string[] = [
  '-exec',
  '-execdir',
  '-ok',
  '-okdir',
];

// fd long options that run a command.
const FD_RUNS_CODE: readonly string[] = ['--exec', '--exec-batch'];

const RULE_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*(?:\*)?)(?:\(([\s\S]+)\))?$/;
const WILDCARD = '*';
// Shell syntax that runs or chains a command the word test never sees.
const SYNTAX_PATTERN = /\$\(|`|<\(|>\(|[;|&\n]/;
// A prefix assignment, NAME=value or NAME+=value.
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;
// Quotes, escapes, expansions, and braces, which change a word before the program sees it.
const UNPLAIN_CHARS = /['"\\${}]/;
// The shell expands ? and [...] as well as *.
const GLOB_CHARS = /[*?[\]]/;
// Redirects, grouping, and negation: shell grammar the word test cannot judge.
const GRAMMAR_CHARS = /[<>()!]/;
const VERSION_SUFFIX = /[0-9.]+$/;
const ONE_SLASH = /^\/(?!\/)/;
// A single-dash word holding a capital O; -O is case-sensitive, since -o is a different option.
const GIT_PAGER_SHORT = /^-[^-]*O/;
// A single-dash word holding u, which git clone reads as --upload-pack.
const CLONE_UPLOAD_SHORT = /^-[^-]*u/;
// A single-dash word holding x or X, fd's exec options.
const FD_EXEC_SHORT = /^-[^-]*[xX]/;

const UNPARSABLE_ISSUE = 'the rule does not parse as Tool or Tool(specifier).';
const UNPLAIN_ISSUE =
  'quotes, backslashes, braces, and $ in the words a check reads hide the program from the check, so spell them plainly.';
const DOT_ISSUE =
  'a path with . or .. segments is resolved before links are followed, so spell the path without . or .. segments.';
const SCRATCH_ISSUE =
  'a program in a worker-writable folder (such as /tmp, /var/folders, or /Users/Shared) may be worker code, so use a path outside them.';
const IN_REPO_ISSUE =
  'a command inside the repo is code a worker can write, so use an absolute path outside the repo.';
const PATH_GLOB_ISSUE =
  'a wildcard (*, ?, or [...]) in a program path could match any program, so spell the path out.';
const RUNNER_ISSUE =
  'a rule starting with a shell, interpreter, runner, or wrapper grants arbitrary code, so give the absolute path of a script outside the loop repo, with no wildcard, or grant the program it runs.';
const NO_SCRIPT_ISSUE =
  'a rule starting with bun, npm, make, awk, or another runner that takes no script path grants arbitrary code whatever follows, so grant the program it runs instead.';

/** Parses `Tool` or `Tool(specifier)`; undefined for anything else. */
export function parseRule(text: string): ParsedRule | undefined {
  const m = RULE_PATTERN.exec(text);
  if (m?.[1] === undefined) return undefined;
  return { tool: m[1], specifier: m[2] };
}

// What the judge knows of the loop: its repo and the folders workers write.
interface Where {
  repo: string;
  scratch: readonly string[];
}

const hasGlob = (word: string): boolean => GLOB_CHARS.test(word);
const isUnplain = (word: string): boolean => UNPLAIN_CHARS.test(word);
const hasDotSegment = (p: string): boolean =>
  p.split('/').some((s) => s === '.' || s === '..');

// macOS volumes ignore case by default, and Node's realpathSync keeps the case it is given.
const isUnder = (p: string, root: string): boolean => {
  const child = p.toLowerCase();
  const parent = root.toLowerCase();
  return child === parent || child.startsWith(parent + path.sep);
};

const insideRepo = (p: string, repo: string): boolean =>
  isUnder(realPathOf(p), realPathOf(repo));

const isScratch = (p: string, roots: readonly string[]): boolean =>
  [path.resolve(p), realPathOf(p)].some((c) =>
    roots.some((r) => isUnder(c, r)),
  );

// --- List-level path checks -------------------------------------------------

// In reads and allow, a write rule must name a // path whose first folder holds no wildcard.
function writeScopeIssues(specifier: string | undefined): string[] {
  if (specifier === undefined || specifier === WILDCARD) {
    return [
      'a loop writes only its record, through sidekick loop record, so scope the rule as Edit(//<path>/**) if a write is needed.',
    ];
  }
  if (specifier.startsWith('~')) {
    return [
      'a write path under ~ reaches the home folder and Claude Code settings, so name the folder as Edit(//<path>/**).',
    ];
  }
  if (!specifier.startsWith('//')) {
    return [
      'a relative write path anchors in the loop worktree of the repo, so name the folder as Edit(//<path>/**).',
    ];
  }
  const absolute = specifier.slice(1);
  const [, first = ''] = absolute.split('/');
  if (first === '' || hasGlob(first)) {
    return [
      'a write path with a wildcard or nothing in its first folder reaches the whole disk, so name the folder as Edit(//<path>/**).',
    ];
  }
  return hasDotSegment(absolute)
    ? [
        'a write path with . or .. segments can climb out of the folder it names, so spell the path without them.',
      ]
    : [];
}

// Faults of a rule's path form: never-matching and one-slash paths in every list, the write scope in reads and allow.
function pathRuleIssues(rule: ParsedRule, list: RuleList): string[] {
  const { tool, specifier } = rule;
  const hasPath = specifier !== undefined && specifier !== WILDCARD;
  if (hasPath && PATH_TOOLS.includes(tool)) {
    return [
      `a ${tool} rule with a path never matches, so write ${tool} or ${tool}(*) instead.`,
    ];
  }
  const anchorsAtSource =
    hasPath &&
    (tool === 'Read' || tool === 'Edit') &&
    ONE_SLASH.test(specifier);
  if (anchorsAtSource) {
    return [
      `a ${tool} path with one slash anchors at the settings source, so write // before an absolute path, or ~/ for home.`,
    ];
  }
  if (list === 'never' || !WRITE_TOOLS.includes(tool)) return [];
  return writeScopeIssues(specifier);
}

// --- Per-program checks -----------------------------------------------------

// A program's check: how many words after the command word it reads, which must be plain, and its issues.
interface ProgramCheck {
  reads: number;
  issues: (rest: readonly string[]) => string[];
}

const EVERY_WORD = Number.POSITIVE_INFINITY;

const sidekickIssues = (rest: readonly string[]): string[] => {
  const [next, second] = rest.slice(0, 2).map((w) => w.toLowerCase());
  if (next === undefined) return [];
  const launches =
    next === 'profile' &&
    second !== undefined &&
    (second === 'launch' || hasGlob(second));
  const bad =
    launches || next === 'worker' || hasGlob(next) || next.startsWith('-');
  return bad
    ? [
        'a sidekick rule must name its subcommand without a wildcard or leading option, and never worker or profile launch, which start sessions.',
      ]
    : [];
};

const ghIssues = (rest: readonly string[]): string[] => {
  const [first] = rest;
  if (first === undefined) return [];
  const next = first.toLowerCase();
  const bad =
    hasGlob(next) ||
    next.startsWith('-') ||
    next === 'extension' ||
    next === 'alias';
  return bad
    ? [
        'a gh rule must name its subcommand with no leading option and no wildcard, and never extension or alias, which run code.',
      ]
    : [];
};

// git accepts any unambiguous abbreviation of a long option, so a prefix of one counts.
const isGitCodeOption = (subcommand: string, word: string): boolean => {
  if (GIT_PAGER_SHORT.test(word)) return true;
  if (subcommand === 'clone' && CLONE_UPLOAD_SHORT.test(word)) return true;
  if (!word.startsWith('--')) return false;
  const long = (word.split('=')[0] ?? word).toLowerCase();
  return long.length > 2 && GIT_CODE_OPTIONS.some((o) => o.startsWith(long));
};

function gitIssues(rest: readonly string[]): string[] {
  const [first] = rest;
  if (first === undefined) return [];
  const subcommand = first.toLowerCase();
  if (subcommand.startsWith('-') || hasGlob(subcommand)) {
    return [
      'a git rule must name its subcommand with no option before it and no wildcard in it, since a leading option can set config or the exec path, which runs code.',
    ];
  }
  if (GIT_RUNS_CODE.includes(subcommand)) {
    return [
      `git ${subcommand} can run code of its own, so grant a different subcommand.`,
    ];
  }
  const options = rest.slice(1);
  if (options.some((w) => isGitCodeOption(subcommand, w))) {
    return [
      'a git option such as -O, -u on clone, --upload-pack, --receive-pack, --exec, --open-files-in-pager, or --output runs a command or writes a file, so drop it from the rule.',
    ];
  }
  if (GIT_NAMED_OPTIONS.includes(subcommand) && options.some(hasGlob)) {
    return [
      `a wildcard after git ${subcommand} admits options that run code or write files, so name the options the rule needs instead.`,
    ];
  }
  return [];
}

// A program that runs commands through an option: any wildcard could spell the option.
const optionIssues =
  (runsCode: (word: string) => boolean, issue: string) =>
  (rest: readonly string[]): string[] =>
    rest.some((w) => hasGlob(w) || runsCode(w)) ? [issue] : [];

const longName = (word: string): string => word.split('=')[0] ?? word;

const findIssues = optionIssues(
  (w) => FIND_RUNS_CODE.includes(w),
  'a find rule with -exec, -execdir, -ok, -okdir, or a wildcard can run any command, so name the paths and tests it needs.',
);
const rgIssues = optionIssues(
  (w) => longName(w) === '--pre',
  'an rg rule with --pre or a wildcard can run any command as a preprocessor, so name the pattern, paths, and options it needs.',
);
const fdIssues = optionIssues(
  (w) => FD_EXEC_SHORT.test(w) || FD_RUNS_CODE.includes(longName(w)),
  'an fd rule with -x, -X, --exec, --exec-batch, or a wildcard can run any command, so name the pattern, paths, and options it needs.',
);

const refuse = (issue: string) => (): string[] => [issue];

// The programs a check reads past the command word, keyed by lower-case name.
const PROGRAM_CHECKS: ReadonlyMap<string, ProgramCheck> = new Map([
  [
    'claude',
    {
      reads: 0,
      issues: refuse(
        'a claude rule starts a Claude session, so grant a narrower command.',
      ),
    },
  ],
  ['sidekick', { reads: 2, issues: sidekickIssues }],
  ['git', { reads: EVERY_WORD, issues: gitIssues }],
  ['gh', { reads: 1, issues: ghIssues }],
  ['find', { reads: EVERY_WORD, issues: findIssues }],
  ['rg', { reads: EVERY_WORD, issues: rgIssues }],
  ['fd', { reads: EVERY_WORD, issues: fdIssues }],
  [
    'tar',
    {
      reads: 0,
      issues: refuse(
        'a tar rule can run a command through its options, so grant a narrower command.',
      ),
    },
  ],
  [
    'ssh',
    {
      reads: 0,
      issues: refuse(
        'an ssh rule runs commands on another host, so grant a narrower command.',
      ),
    },
  ],
]);

// --- Command checks ---------------------------------------------------------

// A runner word, or one followed by a version suffix such as python3.12.
const runnerBase = (name: string): string | undefined => {
  if (RUNNER_WORDS.includes(name)) return name;
  const base = name.replace(VERSION_SUFFIX, '');
  return base !== name && RUNNER_WORDS.includes(base) ? base : undefined;
};

const takesAPath = (base: string): boolean =>
  SCRIPT_RUNNERS.includes(base) || WRAPPERS.includes(base);

// How many words after the command word a check reads.
const wordsRead = (name: string): number =>
  PROGRAM_CHECKS.get(name)?.reads ?? (runnerBase(name) === undefined ? 0 : 1);

// Why an absolute program path cannot run, or undefined when it can.
function absolutePathIssue(p: string, where: Where): string | undefined {
  if (hasDotSegment(p)) return DOT_ISSUE;
  if (hasGlob(p)) return PATH_GLOB_ISSUE;
  if (insideRepo(p, where.repo)) return IN_REPO_ISSUE;
  return isScratch(p, where.scratch) ? SCRATCH_ISSUE : undefined;
}

// A command word holding / or starting with ~ must be an absolute path that may run.
function commandPathIssues(word: string, where: Where): string[] {
  if (word.startsWith('~')) {
    return [
      'a command path starting with ~ is not expanded, so spell the path absolute.',
    ];
  }
  if (!word.includes('/')) return [];
  if (!path.isAbsolute(word)) {
    return [
      'a relative command path anchors in the loop worktree of the repo, so spell an absolute path outside the repo.',
    ];
  }
  const issue = absolutePathIssue(word, where);
  return issue === undefined ? [] : [issue];
}

// A script runner's or wrapper's absolute next word is judged as a command of its own.
function runnerIssues(
  name: string,
  rest: readonly string[],
  where: Where,
): string[] {
  const base = runnerBase(name);
  if (base === undefined) return [];
  if (!takesAPath(base)) return [NO_SCRIPT_ISSUE];
  const [next] = rest;
  if (next === undefined || !path.isAbsolute(next)) return [RUNNER_ISSUE];
  const issue = absolutePathIssue(next, where);
  return issue === undefined ? commandIssues(rest, where) : [issue];
}

// Judges `words`, which start at a command word.
function commandIssues(words: readonly string[], where: Where): string[] {
  const [word = ''] = words;
  // Lower case, since the default macOS volume resolves BASH to bash.
  const name = path.basename(word).toLowerCase();
  if (words.slice(0, 1 + wordsRead(name)).some(isUnplain)) {
    return [UNPLAIN_ISSUE];
  }
  const rest = words.slice(1);
  return [
    ...commandPathIssues(word, where),
    ...(PROGRAM_CHECKS.get(name)?.issues(rest) ?? []),
    ...runnerIssues(name, rest, where),
  ];
}

// --- The word walk ----------------------------------------------------------

// Judges the words up to and including the command word, then the command.
function headIssues(
  words: readonly string[],
  commandAt: number,
  where: Where,
): string[] {
  if (commandAt < 0 || words[commandAt] === '') {
    return ['a rule must name a command after any NAME=value words.'];
  }
  const head = words.slice(0, commandAt + 1);
  if (head.some(hasGlob)) {
    return [
      'a wildcard (*, ?, or [...]) before or in the command word could match any program, so spell the command out.',
    ];
  }
  if (head.some((w) => GRAMMAR_CHARS.test(w))) {
    return [
      'a redirect, parenthesis, or ! before or in the command word is shell grammar the check cannot judge, so start the rule with the command.',
    ];
  }
  if (words.slice(0, commandAt).some(isUnplain)) return [UNPLAIN_ISSUE];
  return commandIssues(words.slice(commandAt), where);
}

// Judges a Bash, Monitor, or PowerShell specifier in reads or allow.
function commandToolIssues(
  specifier: string | undefined,
  where: Where,
): string[] {
  if (specifier === undefined || specifier === WILDCARD) {
    return [
      'a Bash, Monitor, or PowerShell rule must name a command, since the bare tool or (*) matches every command.',
    ];
  }
  const syntax = SYNTAX_PATTERN.test(specifier)
    ? [
        'a command substitution, process substitution, ;, |, &, or newline chains commands the check cannot see, so write one rule per command.',
      ]
    : [];
  // Quoting inside a rule is out of scope: words split on whitespace alone.
  const words = specifier.trim().split(/\s+/);
  const commandAt = words.findIndex((w) => !ASSIGNMENT.test(w));
  const assignments =
    commandAt === 0
      ? []
      : [
          'a NAME=value word can change what a program loads, so write the rule without it.',
        ];
  return [...syntax, ...assignments, ...headIssues(words, commandAt, where)];
}

/**
 * Why a rule cannot stand in `list`, one sentence per reason; empty when it
 * passes. Path-rule faults apply to every list, and `Bash` refusals and the
 * write scope to `reads` and `allow` only, since a deny that matches more
 * denies more. `scratchRoots` is the set of folders workers write; tests
 * narrow it.
 */
export function ruleIssues(
  text: string,
  list: RuleList,
  repo: string,
  scratchRoots: readonly string[] = SCRATCH_ROOTS,
): string[] {
  const rule = parseRule(text);
  if (rule === undefined) return [UNPARSABLE_ISSUE];
  const pathIssues = pathRuleIssues(rule, list);
  if (list === 'never' || !COMMAND_TOOLS.includes(rule.tool)) return pathIssues;
  return [
    ...pathIssues,
    ...commandToolIssues(rule.specifier, { repo, scratch: scratchRoots }),
  ];
}
