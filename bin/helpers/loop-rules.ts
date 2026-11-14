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
];

const RULE_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*(?:\*)?)(?:\(([\s\S]+)\))?$/;
const PATH_TOOLS = ['Write', 'NotebookEdit', 'MultiEdit', 'Glob', 'Grep'];
const SYNTAX_PATTERN = /\$\(|`|<\(|>\(|[;|&\n]/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const UNPLAIN_WORD = /['"\\${}]/;
const WILDCARD = '*';

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

const pathToolIssues = (rule: ParsedRule): string[] => {
  const { tool, specifier } = rule;
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

/** Whether `script` is an absolute path, wildcard-free, outside `repo`. */
const isOutsideScript = (script: string | undefined, repo: string): boolean =>
  script !== undefined &&
  path.isAbsolute(script) &&
  !script.includes(WILDCARD) &&
  !insideRepo(script, repo);

const SCRIPT_ADVICE =
  'give the absolute path of a script outside the loop repo, with no wildcard, or grant the program it runs';

const commandPathIssues = (word: string, repo: string): string[] => {
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
  if (insideRepo(word, repo)) {
    return [
      'a command inside the repo is code a worker can write, so use an absolute path outside the repo.',
    ];
  }
  return [];
};

const programIssues = (name: string, next: string | undefined): string[] => {
  if (name === 'claude') {
    return [
      'a claude rule starts a Claude session, so grant a narrower command.',
    ];
  }
  if (name === 'sidekick') {
    const bad =
      next !== undefined &&
      (next === 'worker' || next.includes(WILDCARD) || next.startsWith('-'));
    return bad
      ? [
          'a sidekick rule must name its subcommand without a wildcard or leading option, and never worker, which dispatches sessions.',
        ]
      : [];
  }
  if (name === 'git') {
    const bad =
      next !== undefined && (next.startsWith('-') || next.includes(WILDCARD));
    return bad
      ? [
          'a git rule must name its subcommand with no option before it and no wildcard in it, since a leading option can set config or the exec path, which runs code.',
        ]
      : [];
  }
  if (name === 'gh') {
    const bad =
      next !== undefined &&
      (next.includes(WILDCARD) ||
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

const runnerIssues = (
  name: string,
  next: string | undefined,
  repo: string,
): string[] => {
  if (!RUNNER_WORDS.includes(name)) return [];
  if (name !== 'eval' && isOutsideScript(next, repo)) return [];
  return [
    `a rule starting with a shell, interpreter, runner, or wrapper grants arbitrary code, so ${SCRIPT_ADVICE}.`,
  ];
};

const bashIssues = (specifier: string | undefined, repo: string): string[] => {
  if (specifier === undefined || specifier === WILDCARD) {
    return [
      'a Bash rule must name a command, since a bare Bash or Bash(*) grants a shell.',
    ];
  }
  const issues = SYNTAX_PATTERN.test(specifier)
    ? [
        'a command substitution, process substitution, ;, |, &, or newline chains commands the check cannot see, so write one rule per command.',
      ]
    : [];
  const words = specifier.trim().split(/\s+/);
  // Quoting inside a rule is out of scope: words split on whitespace alone.
  const commandAt = words.findIndex((w) => !ASSIGNMENT.test(w));
  if (commandAt < 0 || words[commandAt] === '') {
    return [
      ...issues,
      'a Bash rule must name a command after any NAME=value words.',
    ];
  }
  if (words.slice(0, commandAt + 1).some((w) => w.includes(WILDCARD))) {
    return [
      ...issues,
      'a wildcard before or in the command word could match any program, so spell the command out.',
    ];
  }
  if (words.slice(0, commandAt + 2).some((w) => UNPLAIN_WORD.test(w))) {
    return [
      ...issues,
      'quotes, backslashes, braces, and $ in the command words hide the program from the check, so spell them plainly.',
    ];
  }
  const word = words[commandAt] ?? '';
  const next = words[commandAt + 1];
  const pathIssues =
    word.includes('/') || word.startsWith('~')
      ? commandPathIssues(word, repo)
      : [];
  // Lower case, since the default macOS volume resolves BASH to bash.
  const name = path.basename(word).toLowerCase();
  return [
    ...issues,
    ...pathIssues,
    ...programIssues(name, next),
    ...runnerIssues(name, next, repo),
  ];
};

/**
 * Why a rule cannot stand in `list`, one sentence per reason; empty when it
 * passes. Path-rule faults apply to every list, and `Bash` refusals to
 * `reads` and `allow` only, since a deny that matches more denies more.
 */
export function ruleIssues(
  text: string,
  list: RuleList,
  repo: string,
): string[] {
  const rule = parseRule(text);
  if (rule === undefined) {
    return ['the rule does not parse as Tool or Tool(specifier).'];
  }
  const issues = pathToolIssues(rule);
  if (rule.tool !== 'Bash' || list === 'never') return issues;
  return [...issues, ...bashIssues(rule.specifier, repo)];
}
