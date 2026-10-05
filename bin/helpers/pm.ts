/**
 * `sidekick pm board|pickup|lint|gate` — the read-only seat of project
 * management. Which board a repo is tracked on, what to pick up, what the
 * board contradicts, whether a milestone can close. JSON on stdout, or
 * `pickup` as text with `--brief` and as a status-update body with
 * `--report`; the skills do the judgement and the writes.
 */

import { renderBrief } from './pm-brief.js';
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
  touchedAt,
  versionAtLeast,
} from './pm-data.js';
import { lintAll } from './pm-lint.js';
import { type Plans, planView } from './pm-plans.js';
import { renderReport } from './pm-report.js';
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
  | 'no-local-login'
  | 'remote-owner-mismatch'
  | 'no-board';
export interface TrackedBoard {
  tracked: true;
  reason: null;
  owner: string;
  repo: string;
  viewer: string;
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
  if (login === null) {
    return untracked('no-local-login', {
      owner: parsed.owner,
      repo: parsed.repo,
    });
  }
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
    viewer: d.viewer,
    project: { number: first.number, id: f.id, url: f.url, title: f.title },
    status_field: f.statusField,
    linked: d.boards,
    preflight,
    root,
  };
}

export const PM_USAGE_LINE =
  'sidekick pm <board|pickup|lint|gate> [--quiet] [--brief|--report] [--milestone <title>]';
export const PM_USAGE = `usage: ${PM_USAGE_LINE}`;

export interface PmEnv {
  cwd: string;
  now?: Date;
  run?: Runner;
}

const VERBS = new Set(['board', 'pickup', 'lint', 'gate']);

// Reads `--milestone <title>` and `--milestone=<title>`. A flag with no
// value, or whose next argument is another flag, is `invalid`.
function milestoneFlag(args: string[]): {
  title: string | undefined;
  invalid: boolean;
} {
  const at = args.findIndex(
    (a) => a === '--milestone' || a.startsWith('--milestone='),
  );
  if (at < 0) return { title: undefined, invalid: false };
  const title = args[at].startsWith('--milestone=')
    ? args[at].slice('--milestone='.length)
    : args[at + 1];
  const usable = title !== undefined && title !== '' && !title.startsWith('--');
  return usable
    ? { title, invalid: false }
    : { title: undefined, invalid: true };
}

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
  const brief = rest.includes('--brief');
  const report = rest.includes('--report');
  const quiet = rest.includes('--quiet') || brief;
  const ms = milestoneFlag(rest);
  const msTitle = ms.title;
  if (
    (verb === 'gate' && msTitle === undefined) ||
    ms.invalid ||
    (brief && report)
  ) {
    err(PM_USAGE);
    return 1;
  }
  const emit = (o: unknown): void => out(JSON.stringify(o, null, 2));
  try {
    const info = discover(run, env.cwd);
    const { root: _root, ...shown } = info;
    if (!info.tracked) {
      if (report) {
        err(`not tracked: ${info.reason}`);
        return 1;
      }
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
    const viewer = info.viewer;
    if (verb === 'pickup') {
      const open = fetchMilestones(run, info.root, owner, repo, 'open').sort(
        (a, b) => a.number - b.number,
      );
      const { items, kinds } = fetchItems(
        run,
        info.root,
        viewer,
        project.number,
        fullName,
      );
      const active =
        msTitle === undefined
          ? activeMilestone(open, items)
          : namedMilestone(open, msTitle);
      const plans = active ? planView(active, items) : null;
      if (report) {
        return emitReport(
          { board: { owner, repo }, open, milestone: active, plans },
          out,
          err,
        );
      }
      const t = tiers(items, active, now);
      const working = inProgressMilestones(open, items);
      const split = working.length > 1 ? working.map((m) => m.title) : [];
      const pickup = {
        board: { ...shown, item_kinds: kinds },
        milestone: active,
        open_milestones: open.map((m) => ({
          number: m.number,
          title: m.title,
        })),
        in_progress: t.in_progress,
        candidates: t.candidates,
        order_basis: 'number' as const,
        plans,
        drift: drift(run, info.root, t.in_progress, split),
      };
      if (brief)
        out(renderBrief({ ...pickup, board: { owner, repo, project } }));
      else emit(pickup);
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
    // Unreachable: VERBS is checked above and every member handles and
    // returns. Kept because TypeScript cannot prove the verb set exhaustive.
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

// --report prints only a sound status update; anything else is exit 1 with
// its reason, so a skill posts nothing half-formed.
function emitReport(
  r: {
    board: { owner: string; repo: string };
    open: Milestone[];
    milestone: Milestone | null;
    plans: Plans | null;
  },
  out: (line: string) => void,
  err: (line: string) => void,
): number {
  const { board, open, milestone, plans } = r;
  if (open.length === 0) {
    err('no open milestone to report on');
    return 1;
  }
  if (milestone === null || plans === null) {
    err(
      `no active milestone among ${open.length} open (${open.map((m) => m.title).join(', ')}); pass --milestone`,
    );
    return 1;
  }
  if (plans.parse !== 'ok') {
    err(
      plans.parse === 'none'
        ? `milestone "${milestone.title}" has no plans header`
        : `milestone "${milestone.title}": ${plans.reason ?? 'malformed plans header'}`,
    );
    return 1;
  }
  out(renderReport({ board, milestone, plans }));
  return 0;
}

/** Open milestones holding open In Progress cards, by number. */
export function inProgressMilestones(
  open: Milestone[],
  items: Item[],
): Milestone[] {
  const titles = new Set(
    items
      .filter((i) => i.state === 'OPEN' && i.status === 'In Progress')
      .map((i) => i.milestone),
  );
  return open
    .filter((m) => m.state === 'open' && titles.has(m.title))
    .sort((a, b) => a.number - b.number);
}

/**
 * The milestone the work is in: the one open milestone holding In
 * Progress cards, else the only open one. `null` when the board cannot
 * say; the operator chooses.
 */
export function activeMilestone(
  open: Milestone[],
  items: Item[],
): Milestone | null {
  const working = inProgressMilestones(open, items);
  if (working.length === 1) return working[0];
  const live = open.filter((m) => m.state === 'open');
  return working.length === 0 && live.length === 1 ? live[0] : null;
}

function namedMilestone(open: Milestone[], title: string): Milestone {
  const found = open.find((m) => m.title === title);
  if (found) return found;
  throw new PmError(
    1,
    `no open milestone titled "${title}"; open: ${open.map((m) => m.title).join(', ') || '(none)'}`,
  );
}

export interface InProgress {
  number: number;
  title: string;
  item_id: string;
  age_days: number;
  assignees: string[];
  milestone: string | null;
}
export interface Candidate {
  tier: 1 | 2;
  number: number;
  title: string;
  item_id: string;
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
      item_id: i.itemId,
      age_days: ageDays(touchedAt(i), now),
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
      item_id: i.itemId,
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
  /** Open milestones holding In Progress cards, when two or more do. */
  in_progress_split: string[];
}

export function drift(
  run: Runner,
  root: string,
  inProgress: InProgress[],
  inProgressSplit: string[] = [],
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
      try {
        const list = JSON.parse(r.stdout) as Array<{
          number: number;
          title: string;
        }>;
        open_pr = list[0] ?? null;
      } catch {
        open_pr = null;
      }
    }
  }
  return {
    unpushed: { count, basis },
    stale_in_progress: inProgress.filter((i) => i.age_days > STALE_DAYS),
    open_pr,
    in_progress_split: inProgressSplit,
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
    /** `null` when the issue is `unboarded` (no card at all). */
    item_id: string | null;
    labels: string[];
  }>;
} {
  const itemByNumber = new Map(items.map((i) => [i.number, i]));
  const open = issues
    .filter((i) => i.milestone === ms.title)
    .sort((a, b) => a.number - b.number)
    .map((i) => ({
      number: i.number,
      title: i.title,
      status: itemByNumber.get(i.number)?.status ?? null,
      item_id: itemByNumber.get(i.number)?.itemId ?? null,
      labels: i.labels,
    }));
  return { ready: ms.open_issues === 0 && open.length === 0, open };
}
