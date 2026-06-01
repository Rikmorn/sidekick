import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CommitRef {
  hash: string;
  subject: string;
}

export interface ChecklistTask {
  id: string; // canonical literal from the checklist, e.g. "T-01"
  num: number; // parsed integer, e.g. 1
  checked: boolean;
  description: string;
  hasMatch: boolean;
  commits: CommitRef[];
}

export type ReconcileVerdict = 'analysed' | 'missing_plan' | 'no_checklist';

export interface ReconcilePlanResult {
  verdict: ReconcileVerdict;
  slug: string;
  tasks: ChecklistTask[];
  unmapped_commits: CommitRef[];
  proposed_flips: string[]; // task IDs currently [ ] with a tagged match
  reason?: string;
}

// ---- pure core --------------------------------------------------------------

const CHECKLIST_HEADING = /^##\s+Checklist\s*$/m;
// A checklist row: "- [ ] T-01 <description>" or "- [x] T-07 <description>"
const TASK_ROW = /^- \[([ xX])\]\s+(T-(\d+))\s+(.*)$/;
// A [T-NN] tag anywhere in a commit subject.
const COMMIT_TAG = /\[T-(\d+)\]/;

/**
 * Pure reconciliation analysis. Takes the PLAN.md text and the commit list;
 * returns the matched/unmapped split and proposed flips. No IO.
 */
export function analyseReconciliation(
  planContent: string,
  commits: CommitRef[],
  slug = '',
): ReconcilePlanResult {
  const base: Omit<ReconcilePlanResult, 'verdict'> = {
    slug,
    tasks: [],
    unmapped_commits: [],
    proposed_flips: [],
  };

  if (!CHECKLIST_HEADING.test(planContent)) {
    return {
      verdict: 'no_checklist',
      ...base,
      reason: 'no "## Checklist" section in PLAN.md',
    };
  }

  // Parse the checklist rows.
  const tasks: ChecklistTask[] = [];
  for (const line of planContent.split('\n')) {
    const m = line.match(TASK_ROW);
    if (!m) continue;
    tasks.push({
      id: m[2],
      num: Number.parseInt(m[3], 10),
      checked: m[1].toLowerCase() === 'x',
      description: m[4].trim(),
      hasMatch: false,
      commits: [],
    });
  }

  // Match commits by integer tag.
  const unmapped: CommitRef[] = [];
  for (const commit of commits) {
    const tag = commit.subject.match(COMMIT_TAG);
    if (!tag) {
      unmapped.push(commit);
      continue;
    }
    const num = Number.parseInt(tag[1], 10);
    const task = tasks.find((t) => t.num === num);
    if (task) {
      task.hasMatch = true;
      task.commits.push(commit);
    } else {
      unmapped.push(commit); // tag refers to a task not in the checklist
    }
  }

  const proposed_flips = tasks
    .filter((t) => t.hasMatch && !t.checked)
    .map((t) => t.id);

  return {
    verdict: 'analysed',
    ...base,
    tasks,
    unmapped_commits: unmapped,
    proposed_flips,
  };
}

/**
 * Pure transform: flip "- [ ] T-NN" → "- [x] T-NN" for the named task IDs.
 * Never un-checks. No-op for IDs not in the checklist. Preserves all other bytes.
 */
export function applyFlips(planContent: string, taskIds: string[]): string {
  const targets = new Set(taskIds);
  return planContent
    .split('\n')
    .map((line) => {
      const m = line.match(TASK_ROW);
      if (!m) return line;
      const id = m[2];
      const checked = m[1].toLowerCase() === 'x';
      if (targets.has(id) && !checked) {
        return line.replace(/^- \[ \]/, '- [x]');
      }
      return line;
    })
    .join('\n');
}

// ---- IO wrapper -------------------------------------------------------------

export interface ReconcilePlanCliInput {
  repoRoot: string;
  slug: string;
  defaultBranch: string;
  apply?: string[]; // task IDs to flip + write; undefined = analysis only
  format: 'json' | 'kv';
}

function gitCommits(repoRoot: string, range: string): CommitRef[] {
  // %H = full hash, %x00 = NUL separator, %s = subject. NUL avoids subject-delimiter collisions.
  const out = execFileSync(
    'git',
    ['log', range, '--no-merges', '--format=%H%x00%s'],
    { cwd: repoRoot, encoding: 'utf-8' },
  );
  return out
    .split('\n')
    .filter((l) => l.includes('\x00'))
    .map((l) => {
      const [hash, subject] = l.split('\x00');
      return { hash, subject };
    });
}

export function runReconcilePlanCli(opts: ReconcilePlanCliInput): string {
  const { repoRoot, slug, defaultBranch, apply, format } = opts;
  const planPath = path.join(repoRoot, '.sidekick', 'plans', slug, 'PLAN.md');

  if (!fs.existsSync(planPath)) {
    const result: ReconcilePlanResult = {
      verdict: 'missing_plan',
      slug,
      tasks: [],
      unmapped_commits: [],
      proposed_flips: [],
      reason: `PLAN.md not found at ${planPath}`,
    };
    return format === 'kv' ? toKv(result) : JSON.stringify(result, null, 2);
  }

  const planContent = fs.readFileSync(planPath, 'utf-8');

  if (apply && apply.length > 0) {
    const next = applyFlips(planContent, apply);
    const changed = next !== planContent;
    if (changed) {
      fs.writeFileSync(planPath, next);
    }
    // Report only the task IDs whose row actually flipped [ ]→[x].
    const flipped = apply.filter(
      (id) =>
        planContent.includes(`- [ ] ${id} `) && next.includes(`- [x] ${id} `),
    );
    const written = { written: changed, plan_path: planPath, flipped };
    return format === 'kv' ? toKv(written) : JSON.stringify(written, null, 2);
  }

  const commits = gitCommits(repoRoot, `${defaultBranch}..HEAD`);
  const result = analyseReconciliation(planContent, commits, slug);
  return format === 'kv' ? toKv(result) : JSON.stringify(result, null, 2);
}

function toKv(obj: object): string {
  return Object.entries(obj)
    .map(
      ([k, v]: [string, unknown]) =>
        `${k}=${v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)}`,
    )
    .join('\n');
}
