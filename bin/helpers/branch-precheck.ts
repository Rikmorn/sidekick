import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type Operation = 'design' | 'build' | 'decide' | 'review' | 'regen-plan';
export type Verdict =
  | 'proceed'
  | 'propose_branch'
  | 'confirm_action'
  | 'hard_stop';

export interface BranchPrecheckInput {
  repoRoot: string;
  operation: Operation;
  ticketId?: string;
  ticketTitle?: string;
  branchType?: 'feat' | 'fix' | 'chore' | 'docs';
}

export interface BranchPrecheckResult {
  verdict: Verdict;
  reason: string;
  operation: Operation | 'unknown';
  on_branch: string;
  default_branch: string;
  default_branch_source: 'config' | 'origin_head' | 'cascade' | 'unknown';
  tree_state: 'clean' | 'dirty';
  modified_files_count: number;
  mid_op: 'none' | 'rebase' | 'merge' | 'cherry-pick' | 'bisect';
  detached_head: boolean;
  upstream: string;
  ahead: number;
  behind: number;
  diverged: boolean;
  gh_available: boolean;
  proposed_branch?: string;
  hard_stop_message?: string;
}

const VALID_OPERATIONS: readonly Operation[] = [
  'design',
  'build',
  'decide',
  'review',
  'regen-plan',
];

// ---- helpers ----------------------------------------------------------------

function safeExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
  } catch {
    return '';
  }
}

function detectMidOp(repoRoot: string): BranchPrecheckResult['mid_op'] {
  const gitDir = path.join(repoRoot, '.git');
  if (
    fs.existsSync(path.join(gitDir, 'rebase-merge')) ||
    fs.existsSync(path.join(gitDir, 'rebase-apply'))
  ) {
    return 'rebase';
  }
  if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) return 'merge';
  if (fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD')))
    return 'cherry-pick';
  if (fs.existsSync(path.join(gitDir, 'BISECT_LOG'))) return 'bisect';
  return 'none';
}

/**
 * Slugify a string: lowercase, non-alphanumeric runs → single hyphen,
 * trim leading/trailing hyphens, truncate to 50 chars.
 */
function slugify(input: string): string {
  let s = input.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  s = s.slice(0, 50);
  s = s.replace(/-+$/, '');
  return s;
}

/**
 * Compose a branch name from branchType, ticketId and optional ticketTitle.
 * ticketId is lowercased. branchType defaults to 'feat'.
 */
function slugifyBranch(
  branchType: string,
  ticketId: string,
  ticketTitle?: string,
): string {
  const type = branchType || 'feat';
  const id = ticketId.toLowerCase();
  if (ticketTitle) {
    const slug = slugify(ticketTitle);
    if (slug) {
      return `${type}/${id}-${slug}`;
    }
  }
  return `${type}/${id}`;
}

/**
 * Resolve the default branch from:
 * 1. .sidekick/config.json (highest precedence)
 * 2. origin/HEAD
 * 3. Cascade through common branch names
 */
function resolveDefaultBranch(
  repoRoot: string,
  configDefaultBranch?: string,
): {
  defaultBranch: string;
  source: BranchPrecheckResult['default_branch_source'];
} {
  // 1. From .sidekick/config.json
  if (configDefaultBranch) {
    return { defaultBranch: configDefaultBranch, source: 'config' };
  }

  // 2. origin/HEAD
  const originHead = safeExec(
    'git symbolic-ref --short refs/remotes/origin/HEAD',
    repoRoot,
  ).trim();
  if (originHead.startsWith('origin/')) {
    return {
      defaultBranch: originHead.slice('origin/'.length),
      source: 'origin_head',
    };
  }

  // 3. Cascade
  const cascade = ['main', 'master', 'dev', 'trunk', 'develop'] as const;
  for (const candidate of cascade) {
    const out = safeExec(
      `git rev-parse --verify --quiet refs/heads/${candidate}`,
      repoRoot,
    );
    if (out !== '') {
      return { defaultBranch: candidate, source: 'cascade' };
    }
  }

  return { defaultBranch: '', source: 'unknown' };
}

/**
 * Return a skeleton result used for early hard-stops before git state is gathered.
 */
function baseResult(
  verdict: Verdict,
  reason: string,
  input: BranchPrecheckInput,
  hardStopMessage?: string,
): BranchPrecheckResult {
  return {
    verdict,
    reason,
    operation: input.operation as Operation,
    on_branch: '',
    default_branch: '',
    default_branch_source: 'unknown',
    tree_state: 'clean',
    modified_files_count: 0,
    mid_op: 'none',
    detached_head: false,
    upstream: '',
    ahead: 0,
    behind: 0,
    diverged: false,
    gh_available: false,
    ...(hardStopMessage !== undefined
      ? { hard_stop_message: hardStopMessage }
      : {}),
  };
}

// ---- main export ------------------------------------------------------------

export function runBranchPrecheck(
  input: BranchPrecheckInput,
): BranchPrecheckResult {
  const { repoRoot, operation, ticketId, ticketTitle, branchType } = input;

  // Rule 1: invalid operation
  if (!VALID_OPERATIONS.includes(operation as Operation)) {
    return baseResult('hard_stop', 'invalid_operation', input);
  }

  // Rule 2: missing .sidekick/config.json
  const configPath = path.join(repoRoot, '.sidekick', 'config.json');
  if (!fs.existsSync(configPath)) {
    return baseResult(
      'hard_stop',
      'missing_config',
      input,
      "Run 'npx sidekick init' to create .sidekick/config.json.",
    );
  }

  // Read config (best-effort; only use defaultBranch if valid)
  let configDefaultBranch: string | undefined;
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as { defaultBranch?: unknown };
    if (
      typeof parsed.defaultBranch === 'string' &&
      parsed.defaultBranch.length > 0
    ) {
      configDefaultBranch = parsed.defaultBranch;
    }
  } catch {
    // Malformed config: treat as if defaultBranch not set; let cascade handle it.
  }

  // ---- gather git state ---------------------------------------------------

  // Current branch / detached HEAD
  const branchRaw = safeExec('git symbolic-ref --short HEAD', repoRoot).trim();
  const detachedHead = branchRaw === '' || branchRaw === 'HEAD';
  const onBranch = detachedHead ? '' : branchRaw;

  // Working tree state
  const statusRaw = safeExec(
    'git status --porcelain --untracked-files=all',
    repoRoot,
  );
  const modifiedLines = statusRaw.split('\n').filter((l) => l.trim() !== '');
  const modifiedFilesCount = modifiedLines.length;
  const treeState: 'clean' | 'dirty' =
    modifiedFilesCount === 0 ? 'clean' : 'dirty';

  // Mid-operation state
  const midOp = detectMidOp(repoRoot);

  // Default branch resolution
  const { defaultBranch, source: defaultBranchSource } = resolveDefaultBranch(
    repoRoot,
    configDefaultBranch,
  );

  // Upstream / ahead / behind / diverged
  let upstream = '';
  let ahead = 0;
  let behind = 0;
  let diverged = false;

  if (!detachedHead && onBranch) {
    upstream = safeExec(
      'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
      repoRoot,
    ).trim();
    if (upstream) {
      const countsRaw = safeExec(
        `git rev-list --left-right --count HEAD...${upstream}`,
        repoRoot,
      ).trim();
      const parts = countsRaw.split(/\s+/);
      if (parts.length === 2) {
        ahead = Number.parseInt(parts[0] ?? '0', 10) || 0;
        behind = Number.parseInt(parts[1] ?? '0', 10) || 0;
      }
      diverged = ahead > 0 && behind > 0;
    }
  }

  // gh CLI availability
  const ghAvailable = (() => {
    try {
      execSync('gh --version', { stdio: 'ignore' });
      // Also check auth status like thor-v2
      execSync('gh auth status', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  // ---- policy rules -------------------------------------------------------

  // Rule 3: mid-op
  if (midOp !== 'none') {
    const hardStopMessages: Record<string, string> = {
      rebase:
        'Resolve the in-progress rebase with `git rebase --continue` or `git rebase --abort`, then re-run.',
      merge:
        'Resolve the in-progress merge with `git merge --continue` or `git merge --abort`, then re-run.',
      'cherry-pick':
        'Resolve the in-progress cherry-pick with `git cherry-pick --continue` or `git cherry-pick --abort`, then re-run.',
      bisect:
        'Finish the in-progress bisect (`git bisect reset`), then re-run.',
    };
    return {
      verdict: 'hard_stop',
      reason: `mid_${midOp}`,
      operation,
      on_branch: onBranch,
      default_branch: defaultBranch,
      default_branch_source: defaultBranchSource,
      tree_state: treeState,
      modified_files_count: modifiedFilesCount,
      mid_op: midOp,
      detached_head: detachedHead,
      upstream,
      ahead,
      behind,
      diverged,
      gh_available: ghAvailable,
      hard_stop_message:
        hardStopMessages[midOp] ??
        `In-progress operation: ${midOp}. Resolve before re-running.`,
    };
  }

  // Rule 4: detached HEAD
  if (detachedHead) {
    return {
      verdict: 'hard_stop',
      reason: 'detached_head',
      operation,
      on_branch: '',
      default_branch: defaultBranch,
      default_branch_source: defaultBranchSource,
      tree_state: treeState,
      modified_files_count: modifiedFilesCount,
      mid_op: midOp,
      detached_head: true,
      upstream,
      ahead,
      behind,
      diverged,
      gh_available: ghAvailable,
      hard_stop_message:
        'HEAD is detached. Check out a branch (`git switch <branch>`) before re-running.',
    };
  }

  // Rule 5: diverged from remote
  if (diverged) {
    return {
      verdict: 'hard_stop',
      reason: 'diverged_from_remote',
      operation,
      on_branch: onBranch,
      default_branch: defaultBranch,
      default_branch_source: defaultBranchSource,
      tree_state: treeState,
      modified_files_count: modifiedFilesCount,
      mid_op: midOp,
      detached_head: false,
      upstream,
      ahead,
      behind,
      diverged: true,
      gh_available: ghAvailable,
      hard_stop_message: `Local and remote have both moved (ahead=${ahead}, behind=${behind}). Pull, rebase, or reset deliberately before re-running.`,
    };
  }

  // Rule 6: cannot determine default branch
  if (!defaultBranch || defaultBranchSource === 'unknown') {
    return {
      verdict: 'hard_stop',
      reason: 'cannot_determine_default_branch',
      operation,
      on_branch: onBranch,
      default_branch: '',
      default_branch_source: 'unknown',
      tree_state: treeState,
      modified_files_count: modifiedFilesCount,
      mid_op: midOp,
      detached_head: false,
      upstream,
      ahead,
      behind,
      diverged: false,
      gh_available: ghAvailable,
      hard_stop_message:
        'Could not determine the default branch. Configure it in `.sidekick/config.json` ("defaultBranch": "main") or run `git remote set-head origin main` to set `origin/HEAD`.',
    };
  }

  // Helper for fully-populated results (rules 7+)
  const fullResult = (
    verdict: Verdict,
    reason: string,
    extras: Partial<BranchPrecheckResult> = {},
  ): BranchPrecheckResult => ({
    verdict,
    reason,
    operation,
    on_branch: onBranch,
    default_branch: defaultBranch,
    default_branch_source: defaultBranchSource,
    tree_state: treeState,
    modified_files_count: modifiedFilesCount,
    mid_op: midOp,
    detached_head: false,
    upstream,
    ahead,
    behind,
    diverged,
    gh_available: ghAvailable,
    ...extras,
  });

  // Rule 7 (spec): decide on default branch → proceed immediately
  if (operation === 'decide' && onBranch === defaultBranch) {
    return fullResult('proceed', 'state_ok');
  }

  // Rule 8 (spec): design on default branch
  if (operation === 'design' && onBranch === defaultBranch) {
    if (ticketId) {
      const proposedBranch = slugifyBranch(
        branchType ?? 'feat',
        ticketId,
        ticketTitle,
      );
      return fullResult('propose_branch', 'on_default_for_design', {
        proposed_branch: proposedBranch,
      });
    }
    return fullResult('confirm_action', 'on_default_for_design_no_ticket');
  }

  // Rule 9 (spec): build on default branch
  if (operation === 'build' && onBranch === defaultBranch) {
    return fullResult('confirm_action', 'on_default_for_build');
  }

  // Rule 11: review on default branch → --fix would commit remediation to the integration line
  if (operation === 'review' && onBranch === defaultBranch) {
    return fullResult('hard_stop', 'on_default_for_review', {
      hard_stop_message:
        'You are on the default branch. `/sk-review --fix` commits remediation; switch to a feature branch before re-running.',
    });
  }

  // Rule 12: regen-plan on default branch → `git log <default>..HEAD` mixes merge commits on the integration line
  if (operation === 'regen-plan' && onBranch === defaultBranch) {
    return fullResult('hard_stop', 'on_default_for_regen_plan', {
      hard_stop_message:
        'You are on the default branch. `/sk-regen-plan` reconciles a feature branch against the default; switch to the feature branch before re-running.',
    });
  }

  // Rule 10: fall through → proceed
  return fullResult('proceed', 'state_ok');
}

export function runBranchPrecheckCli(
  opts: BranchPrecheckInput & { format: 'json' | 'kv' },
): string {
  const { format, ...input } = opts;
  const result = runBranchPrecheck(input);
  if (format === 'kv') {
    return Object.entries(result)
      .map(([k, v]) => `${k}=${v === undefined ? '' : String(v)}`)
      .join('\n');
  }
  return JSON.stringify(result, null, 2);
}
