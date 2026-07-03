import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parsePlanTasks } from './wave-plan.js';

export interface ScopeCheckCliInput {
  repoRoot: string;
  /** Mode A: plan slug under `.sidekick/plans/<slug>/PLAN.md`. */
  slug?: string;
  /** Mode A: task id, e.g. "T-04". */
  task?: string;
  /** Mode B: explicit declared scope. Presence (even empty) selects mode B. */
  declared?: string[];
  /** Paths already dirty before the producer ran — subtracted from actual. */
  baseline?: string[];
  /** Producer's self-reported change set — drives the reported-vs-actual deltas. */
  reported?: string[];
}

export interface ScopeCheckCliResult {
  stdout: string;
  exitCode: number;
}

export interface ScopeCheckReport {
  task_id: string | null;
  declared: string[];
  baseline: string[];
  actual: string[];
  out_of_scope: string[];
  unreported: string[] | null;
  reported_unchanged: string[] | null;
  verdict: 'clean' | 'out_of_scope';
  warnings: string[];
}

/** Trim, drop empties, POSIX-normalize a path list; dedupe preserving nothing. */
function normPaths(paths: string[]): string[] {
  const out = new Set<string>();
  for (const raw of paths) {
    const p = raw.replace(/\\/g, '/').trim();
    if (p !== '') out.add(p);
  }
  return [...out];
}

/**
 * Parse `git status --porcelain=v1` output into the set of changed paths.
 * Porcelain v1 lines are `XY <path>` (2 status chars + space + path); a rename
 * is `R  <old> -> <new>` — both sides are attributed. Untracked, staged,
 * unstaged, and deletions all contribute their path.
 */
function parseStatusPaths(porcelain: string): string[] {
  const paths: string[] = [];
  for (const line of porcelain.split('\n')) {
    if (line.trim() === '') continue;
    const xy = line.slice(0, 2);
    const rest = line.slice(3);
    if ((xy.includes('R') || xy.includes('C')) && rest.includes(' -> ')) {
      const [orig, renamed] = rest.split(' -> ');
      paths.push(orig, renamed);
    } else {
      paths.push(rest);
    }
  }
  return paths;
}

/** A declared entry ending in `/` covers any path under that prefix; else exact. */
function isCovered(candidate: string, declared: string[]): boolean {
  for (const d of declared) {
    if (d.endsWith('/')) {
      if (candidate.startsWith(d)) return true;
    } else if (candidate === d) {
      return true;
    }
  }
  return false;
}

const sorted = (paths: Iterable<string>): string[] => [...paths].sort();

function err(message: string): ScopeCheckCliResult {
  return { stdout: JSON.stringify({ error: message }), exitCode: 1 };
}

export function runScopeCheckCli(
  opts: ScopeCheckCliInput,
): ScopeCheckCliResult {
  const { repoRoot } = opts;
  const modeA = opts.slug !== undefined || opts.task !== undefined;
  const modeB = opts.declared !== undefined;

  // Mode resolution — mutually exclusive, one required.
  if (modeA && modeB) {
    return err(
      'mode conflict: pass either --slug/--task (plan-backed) or --declared (explicit), not both',
    );
  }
  if (!modeA && !modeB) {
    return err(
      'no scope given: pass --slug <slug> --task <T-NN> or --declared <p1,p2,...>',
    );
  }

  // Resolve the declared scope.
  let declared: string[];
  let taskId: string | null;
  if (modeA) {
    if (opts.slug === undefined || opts.task === undefined) {
      return err(
        'plan mode needs both --slug and --task (e.g. --slug my-feature --task T-04)',
      );
    }
    const planPath = path.join(
      repoRoot,
      '.sidekick',
      'plans',
      opts.slug,
      'PLAN.md',
    );
    if (!fs.existsSync(planPath)) {
      return err(`PLAN.md not found at ${planPath}`);
    }
    const tasks = parsePlanTasks(fs.readFileSync(planPath, 'utf-8'));
    const wantNum = Number.parseInt(opts.task.replace(/\D/g, ''), 10);
    const match = tasks.find(
      (t) =>
        t.id === opts.task || (!Number.isNaN(wantNum) && t.num === wantNum),
    );
    if (!match) {
      return err(`unknown task id "${opts.task}" — not found in ${planPath}`);
    }
    declared = normPaths(match.files);
    taskId = match.id;
  } else {
    declared = normPaths(opts.declared ?? []);
    taskId = null;
  }

  // Gather the actual change set from git.
  let porcelain: string;
  try {
    porcelain = execFileSync(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    return err(`not a git repository (or git unavailable) at ${repoRoot}`);
  }

  const baseline = normPaths(opts.baseline ?? []);
  const baselineSet = new Set(baseline);
  const changed = new Set(normPaths(parseStatusPaths(porcelain)));
  const actual = new Set<string>();
  for (const p of changed) {
    if (!baselineSet.has(p)) actual.add(p);
  }

  const outOfScope = sorted([...actual].filter((p) => !isCovered(p, declared)));

  let unreported: string[] | null = null;
  let reportedUnchanged: string[] | null = null;
  if (opts.reported !== undefined) {
    const reported = new Set(normPaths(opts.reported));
    unreported = sorted([...actual].filter((p) => !reported.has(p)));
    reportedUnchanged = sorted([...reported].filter((p) => !actual.has(p)));
  }

  const report: ScopeCheckReport = {
    task_id: taskId,
    declared: sorted(declared),
    baseline: sorted(baseline),
    actual: sorted(actual),
    out_of_scope: outOfScope,
    unreported,
    reported_unchanged: reportedUnchanged,
    verdict: outOfScope.length === 0 ? 'clean' : 'out_of_scope',
    warnings: [],
  };
  return { stdout: JSON.stringify(report, null, 2), exitCode: 0 };
}
