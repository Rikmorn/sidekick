import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PlanTask {
  id: string; // canonical literal, e.g. "T-04"
  num: number; // parsed integer, e.g. 4
  deps: string[]; // canonical T-NN refs from **Deps:**
  files: string[]; // normalized repo-relative paths from **Files:**
}

const TASKS_HEADING = /^##\s+Tasks\s*$/m;
const TASK_HEADER = /^###\s+(T-(\d+))\b.*$/;
const DEPS_LINE = /^\*\*Deps:\*\*\s*(.*)$/;
const FILES_LINE = /^\*\*Files:\*\*\s*$/;
const FILE_BULLET = /^-\s*(?:Create|Modify|Test):\s*(.+)$/i;
const T_REF = /T-\d+/g;

function normalizeFilePath(raw: string): string {
  return raw
    .replace(/`/g, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

export function parsePlanTasks(planContent: string): PlanTask[] {
  if (!TASKS_HEADING.test(planContent)) return [];
  const lines = planContent.split('\n');
  const tasks: PlanTask[] = [];
  let current: PlanTask | null = null;
  let inFiles = false;
  let sawTasksHeading = false;

  for (const line of lines) {
    if (TASKS_HEADING.test(line)) {
      sawTasksHeading = true;
      continue;
    }
    if (!sawTasksHeading) continue;

    const header = line.match(TASK_HEADER);
    if (header) {
      current = {
        id: header[1],
        num: Number.parseInt(header[2], 10),
        deps: [],
        files: [],
      };
      tasks.push(current);
      inFiles = false;
      continue;
    }
    if (!current) continue;

    const deps = line.match(DEPS_LINE);
    if (deps) {
      current.deps = deps[1].match(T_REF) ?? [];
      inFiles = false;
      continue;
    }
    if (FILES_LINE.test(line)) {
      inFiles = true;
      continue;
    }
    if (inFiles) {
      const bullet = line.match(FILE_BULLET);
      if (bullet) {
        current.files.push(normalizeFilePath(bullet[1]));
        continue;
      }
      if (line.trim() === '' || line.startsWith('**') || line.startsWith('#')) {
        inFiles = false;
      }
    }
  }
  return tasks;
}

export type WavePlanErrorKind = 'dep_cycle' | 'dangling_dep';

export class WavePlanError extends Error {
  constructor(
    public readonly kind: WavePlanErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'WavePlanError';
  }
}

/**
 * Compute execution waves (topological levels) for the tasks.
 * - Dependency edges come from each task's `deps`.
 * - File-overlap between two dependency-independent tasks is modeled as an
 *   extra edge (lower T-NN before higher) so they never share a wave.
 * Throws WavePlanError on a cycle or a dangling dep ref.
 */
export function computeWaves(tasks: PlanTask[]): {
  waves: string[][];
  warnings: string[];
} {
  const warnings: string[] = [];
  const byId = new Map(tasks.map((task) => [task.id, task]));

  const dependents = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const task of tasks) {
    dependents.set(task.id, dependents.get(task.id) ?? new Set());
    indegree.set(task.id, indegree.get(task.id) ?? 0);
  }
  const addEdge = (prereq: string, dep: string): void => {
    const set = dependents.get(prereq);
    if (set && !set.has(dep)) {
      set.add(dep);
      indegree.set(dep, (indegree.get(dep) ?? 0) + 1);
    }
  };

  // 1. Declared dependency edges.
  for (const task of tasks) {
    for (const dep of task.deps) {
      if (!byId.has(dep)) {
        throw new WavePlanError(
          'dangling_dep',
          `${task.id} depends on ${dep}, which is not a task in the plan`,
        );
      }
      addEdge(dep, task.id);
    }
  }

  // 2. File-overlap edges between dependency-unrelated pairs.
  const relatedAlready = (a: string, b: string): boolean =>
    reachable(a, b, dependents) || reachable(b, a, dependents);
  const sorted = [...tasks].sort((x, y) => x.num - y.num);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const shared = a.files.filter((f) => b.files.includes(f));
      if (shared.length === 0) continue;
      if (relatedAlready(a.id, b.id)) continue;
      addEdge(a.id, b.id);
      warnings.push(
        `${a.id} and ${b.id} share file(s) [${shared.join(', ')}] with no dependency between them — serialized (${a.id} before ${b.id}).`,
      );
    }
  }

  // 3. Kahn's algorithm with longest-path level assignment.
  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) {
      level.set(id, 0);
      queue.push(id);
    }
  }
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    visited++;
    const lvl = level.get(id) ?? 0;
    for (const dep of dependents.get(id) ?? []) {
      level.set(dep, Math.max(level.get(dep) ?? 0, lvl + 1));
      const next = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }
  if (visited < tasks.length) {
    throw new WavePlanError(
      'dep_cycle',
      'dependency cycle detected among tasks (some tasks never reach indegree 0)',
    );
  }

  // 4. Bucket tasks by level, ordered by T-NN within a wave.
  const maxLevel = Math.max(0, ...[...level.values()]);
  const waves: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const task of sorted) {
    waves[level.get(task.id) ?? 0].push(task.id);
  }
  return { waves: waves.filter((w) => w.length > 0), warnings };
}

/** Is `to` reachable from `from` following prerequisite->dependent edges? */
function reachable(
  from: string,
  to: string,
  dependents: Map<string, Set<string>>,
): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (node === to) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of dependents.get(node) ?? []) stack.push(next);
  }
  return false;
}

export type WavePlanVerdict =
  | 'planned'
  | 'missing_plan'
  | 'no_tasks'
  | WavePlanErrorKind;

export interface WavePlanCliInput {
  repoRoot: string;
  slug: string;
  format: 'json' | 'kv';
}

export interface WavePlanResult {
  verdict: WavePlanVerdict;
  slug: string;
  waves?: string[][];
  task_count?: number;
  warnings?: string[];
  reason?: string;
}

export function runWavePlanCli(opts: WavePlanCliInput): string {
  const { repoRoot, slug, format } = opts;
  const planPath = path.join(repoRoot, '.sidekick', 'plans', slug, 'PLAN.md');
  let result: WavePlanResult;

  if (!fs.existsSync(planPath)) {
    result = {
      verdict: 'missing_plan',
      slug,
      reason: `PLAN.md not found at ${planPath}`,
    };
  } else {
    const tasks = parsePlanTasks(fs.readFileSync(planPath, 'utf-8'));
    if (tasks.length === 0) {
      result = {
        verdict: 'no_tasks',
        slug,
        reason: 'no ## Tasks section or no ### T-NN blocks in PLAN.md',
      };
    } else {
      try {
        const { waves, warnings } = computeWaves(tasks);
        result = {
          verdict: 'planned',
          slug,
          waves,
          task_count: tasks.length,
          warnings,
        };
      } catch (err) {
        if (err instanceof WavePlanError) {
          result = { verdict: err.kind, slug, reason: err.message };
        } else {
          throw err;
        }
      }
    }
  }

  if (format === 'kv') {
    return Object.entries(result)
      .map(
        ([k, v]) =>
          `${k}=${v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)}`,
      )
      .join('\n');
  }
  return JSON.stringify(result, null, 2);
}
