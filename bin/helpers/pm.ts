/**
 * `sidekick pm board|pickup|lint|gate` — the read-only seat of project
 * management. Which board a repo is tracked on, what to pick up, what the
 * board contradicts, whether a milestone can close. JSON on stdout; the
 * skills do the judgement and the writes.
 */
import {
  ageDays,
  execRunner,
  fetchDiscovery,
  fetchGhVersion,
  fetchItems,
  fetchLocalLogin,
  fetchMilestones,
  fetchOpenIssues,
  fetchScopeHeaders,
  fetchStatusField,
  hasProjectScope,
  type Issue,
  type Item,
  type LinkedBoard,
  type Milestone,
  PmError,
  parseOrigin,
  type Runner,
  STALE_DAYS,
  type StatusField,
  versionAtLeast,
} from './pm-data.js';
import { lintAll } from './pm-lint.js';
import { repoRootOf } from './rules.js';

/** By-name `item-edit --field --value` lands here; older `gh` writes by id. */
export const GH_MIN = '2.98.0';

export interface Preflight {
  gh_version: string | null;
  gh_min: string;
  gh_ok: boolean;
  project_scope: boolean | null;
  warnings: string[];
}
export type NotTrackedReason =
  | 'no-origin'
  | 'not-github'
  | 'remote-owner-mismatch'
  | 'no-board';
export interface TrackedBoard {
  tracked: true;
  reason: null;
  owner: string;
  repo: string;
  project: { number: number; id: string; url: string; title: string };
  status_field: StatusField | null;
  linked: LinkedBoard[];
  preflight: Preflight;
  root: string;
}
export interface UntrackedBoard {
  tracked: false;
  reason: NotTrackedReason;
  owner: string | null;
  repo: string | null;
  project: null;
  status_field: null;
  linked: LinkedBoard[];
  preflight: Preflight;
  root: string;
}
export type BoardInfo = TrackedBoard | UntrackedBoard;

export function chooseBoard(
  boards: LinkedBoard[],
  viewer: string,
  repo: string,
): LinkedBoard[] {
  return boards
    .filter((b) => !b.closed && b.ownerLogin === viewer && b.title === repo)
    .sort((a, b) => a.number - b.number);
}

function preflightOf(version: string | null): Preflight {
  const ok = version !== null && versionAtLeast(version, GH_MIN);
  const warnings = ok
    ? []
    : [
        `gh ${version ?? 'unknown'} < ${GH_MIN}: by-name item-edit unavailable; write by field and option id`,
      ];
  return {
    gh_version: version,
    gh_min: GH_MIN,
    gh_ok: ok,
    project_scope: null,
    warnings,
  };
}

/**
 * Tracked ⇔ exactly one open board linked to the repo, titled after it,
 * owned by the user. The login check is local so an untracked repo costs
 * no request. Throws `PmError(2)` when `gh` is missing or lacks `project`.
 */
export function discover(run: Runner, cwd: string): BoardInfo {
  const gh = fetchGhVersion(run, cwd);
  if (!gh.found) throw new PmError(2, 'gh not found on PATH');
  const root = repoRootOf(cwd);
  const preflight = preflightOf(gh.version);
  const untracked = (
    reason: NotTrackedReason,
    fields: {
      owner?: string | null;
      repo?: string | null;
      linked?: LinkedBoard[];
    } = {},
  ): UntrackedBoard => ({
    tracked: false,
    reason,
    owner: fields.owner ?? null,
    repo: fields.repo ?? null,
    project: null,
    status_field: null,
    linked: fields.linked ?? [],
    preflight,
    root,
  });

  const origin = run('git', ['remote', 'get-url', 'origin'], root);
  if (origin.code !== 0) return untracked('no-origin');
  const parsed = parseOrigin(origin.stdout);
  if (!parsed) return untracked('not-github');
  const login = fetchLocalLogin(run, root);
  if (login !== parsed.owner) {
    return untracked('remote-owner-mismatch', {
      owner: parsed.owner,
      repo: parsed.repo,
    });
  }

  preflight.project_scope = hasProjectScope(fetchScopeHeaders(run, root));
  if (!preflight.project_scope) {
    throw new PmError(
      2,
      "gh token lacks the 'project' scope; run: gh auth refresh -s project",
    );
  }
  const d = fetchDiscovery(run, root, parsed.owner, parsed.repo);
  const chosen = chooseBoard(d.boards, d.viewer, parsed.repo);
  if (chosen.length === 0) {
    return untracked('no-board', {
      owner: parsed.owner,
      repo: parsed.repo,
      linked: d.boards,
    });
  }
  const first = chosen[0];
  const f = fetchStatusField(run, root, d.viewer, first.number);
  return {
    tracked: true,
    reason: null,
    owner: parsed.owner,
    repo: parsed.repo,
    project: { number: first.number, id: f.id, url: f.url, title: f.title },
    status_field: f.statusField,
    linked: d.boards,
    preflight,
    root,
  };
}

export const PM_USAGE_LINE =
  'sidekick pm <board|pickup|lint|gate> [--quiet] [--milestone <title>]';
export const PM_USAGE = `usage: ${PM_USAGE_LINE}`;

export interface PmEnv {
  cwd: string;
  now?: Date;
  run?: Runner;
}

const VERBS = new Set(['board', 'pickup', 'lint', 'gate']);

export function runPmCli(
  args: string[],
  env: PmEnv,
  out: (line: string) => void,
  err: (line: string) => void,
): number {
  const [verb, ...rest] = args;
  if (!verb || !VERBS.has(verb)) {
    err(PM_USAGE);
    return 1;
  }
  const run = env.run ?? execRunner;
  const quiet = rest.includes('--quiet');
  const msIdx = rest.indexOf('--milestone');
  const msTitle = msIdx >= 0 ? rest[msIdx + 1] : undefined;
  if (verb === 'gate' && !msTitle) {
    err(PM_USAGE);
    return 1;
  }
  const emit = (o: unknown): void => out(JSON.stringify(o, null, 2));
  try {
    const info = discover(run, env.cwd);
    const { root: _root, ...shown } = info;
    if (!info.tracked) {
      if (!quiet) emit(shown);
      return 0;
    }
    if (verb === 'board') {
      emit(shown);
      return 0;
    }
    const now = env.now ?? new Date();
    const owner = info.owner;
    const repo = info.repo;
    const project = info.project;
    const fullName = `${owner}/${repo}`;
    const viewer = fetchLocalLogin(run, info.root) ?? owner;
    if (verb === 'pickup') {
      const active = activeMilestone(
        fetchMilestones(run, info.root, owner, repo, 'open'),
      );
      const { items, kinds } = fetchItems(
        run,
        info.root,
        viewer,
        project.number,
        fullName,
      );
      const t = tiers(items, active, now);
      emit({
        board: { ...shown, item_kinds: kinds },
        milestone: active,
        in_progress: t.in_progress,
        candidates: t.candidates,
        order_basis: 'number',
        drift: drift(run, info.root, t.in_progress),
      });
      return 0;
    }
    if (verb === 'lint') {
      const issues = fetchOpenIssues(run, info.root, owner, repo);
      const { items, kinds } = fetchItems(
        run,
        info.root,
        viewer,
        project.number,
        fullName,
      );
      const candidates = chooseBoard(info.linked, viewer, repo);
      const r = lintAll({ issues, items, candidates, now });
      emit({
        board: { ...shown, item_kinds: kinds },
        findings: r.findings,
        counts: r.counts,
      });
      return 0;
    }
    if (verb === 'gate') {
      const openMs = fetchMilestones(run, info.root, owner, repo, 'open');
      const found =
        openMs.find((m) => m.title === msTitle) ??
        fetchMilestones(run, info.root, owner, repo, 'closed').find(
          (m) => m.title === msTitle,
        );
      if (!found) {
        throw new PmError(
          1,
          `no milestone titled "${msTitle}"; open: ${openMs.map((m) => m.title).join(', ') || '(none)'}`,
        );
      }
      const issues = fetchOpenIssues(run, info.root, owner, repo);
      const { items } = fetchItems(
        run,
        info.root,
        viewer,
        project.number,
        fullName,
      );
      const v = gateVerdict(found, issues, items);
      emit({ board: shown, milestone: found, ready: v.ready, open: v.open });
      return 0;
    }
    err(PM_USAGE);
    return 1;
  } catch (e) {
    if (e instanceof PmError) {
      err(e.message);
      return e.exit;
    }
    err(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

const byTitle = (a: string, b: string): number =>
  a.localeCompare(b, 'en', { numeric: true });

/**
 * Earliest `due_on` first with nulls last, then title (numeric-aware),
 * then number.
 */
export function activeMilestone(list: Milestone[]): Milestone | null {
  const open = list.filter((m) => m.state === 'open');
  if (open.length === 0) return null;
  const sorted = [...open].sort((a, b) => {
    if (a.due_on !== b.due_on) {
      if (a.due_on === null) return 1;
      if (b.due_on === null) return -1;
      return a.due_on < b.due_on ? -1 : 1;
    }
    const t = byTitle(a.title, b.title);
    return t !== 0 ? t : a.number - b.number;
  });
  return sorted[0];
}

export interface InProgress {
  number: number;
  title: string;
  age_days: number;
  assignees: string[];
  milestone: string | null;
}
export interface Candidate {
  tier: 1 | 2;
  number: number;
  title: string;
  labels: string[];
}

export function tiers(
  items: Item[],
  active: Milestone | null,
  now: Date,
): { in_progress: InProgress[]; candidates: Candidate[] } {
  const open = items.filter((i) => i.state === 'OPEN');
  const byNumber = (a: { number: number }, b: { number: number }): number =>
    a.number - b.number;
  const in_progress = open
    .filter((i) => i.status === 'In Progress')
    .map((i) => ({
      number: i.number,
      title: i.title,
      age_days: ageDays(i.updatedAt, now),
      assignees: i.assignees,
      milestone: i.milestone,
    }))
    .sort(byNumber);
  const backlog = open.filter((i) => i.status === 'Backlog');
  const tier1 = active
    ? backlog.filter((i) => i.milestone === active.title)
    : [];
  const tier2 = backlog.filter(
    (i) => i.milestone === null && !i.labels.includes('backlog'),
  );
  const cand =
    (tier: 1 | 2) =>
    (i: Item): Candidate => ({
      tier,
      number: i.number,
      title: i.title,
      labels: i.labels,
    });
  return {
    in_progress,
    candidates: [
      ...tier1.sort(byNumber).map(cand(1)),
      ...tier2.sort(byNumber).map(cand(2)),
    ],
  };
}

export interface Drift {
  unpushed: {
    count: number | null;
    basis: 'upstream' | 'origin-branch' | 'none';
  };
  stale_in_progress: InProgress[];
  open_pr: { number: number; title: string } | null;
}

export function drift(
  run: Runner,
  root: string,
  inProgress: InProgress[],
): Drift {
  const branch = run('git', ['branch', '--show-current'], root).stdout.trim();
  let basis: Drift['unpushed']['basis'] = 'none';
  let base: string | null = null;
  if (run('git', ['rev-parse', '--abbrev-ref', '@{u}'], root).code === 0) {
    basis = 'upstream';
    base = '@{u}';
  } else if (
    branch &&
    run(
      'git',
      ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`],
      root,
    ).code === 0
  ) {
    basis = 'origin-branch';
    base = `origin/${branch}`;
  }
  let count: number | null = null;
  if (base) {
    const r = run('git', ['rev-list', '--count', `${base}..HEAD`], root);
    count = r.code === 0 ? Number(r.stdout.trim()) : null;
  }
  let open_pr: Drift['open_pr'] = null;
  if (branch) {
    const r = run(
      'gh',
      [
        'pr',
        'list',
        '--head',
        branch,
        '--state',
        'open',
        '--json',
        'number,title',
      ],
      root,
    );
    if (r.code === 0) {
      const list = JSON.parse(r.stdout) as Array<{
        number: number;
        title: string;
      }>;
      open_pr = list[0] ?? null;
    }
  }
  return {
    unpushed: { count, basis },
    stale_in_progress: inProgress.filter((i) => i.age_days > STALE_DAYS),
    open_pr,
  };
}

export function gateVerdict(
  ms: Milestone,
  issues: Issue[],
  items: Item[],
): {
  ready: boolean;
  open: Array<{
    number: number;
    title: string;
    status: string | null;
    labels: string[];
  }>;
} {
  const status = new Map(items.map((i) => [i.number, i.status]));
  const open = issues
    .filter((i) => i.milestone === ms.title)
    .sort((a, b) => a.number - b.number)
    .map((i) => ({
      number: i.number,
      title: i.title,
      status: status.get(i.number) ?? null,
      labels: i.labels,
    }));
  return { ready: ms.open_issues === 0 && open.length === 0, open };
}
