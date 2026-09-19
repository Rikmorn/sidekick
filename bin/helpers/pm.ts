/**
 * `sidekick pm board|pickup|lint|gate` — the read-only seat of project
 * management. Which board a repo is tracked on, what to pick up, what the
 * board contradicts, whether a milestone can close. JSON on stdout; the
 * skills do the judgement and the writes.
 */
import {
  execRunner,
  fetchDiscovery,
  fetchGhVersion,
  fetchLocalLogin,
  fetchScopeHeaders,
  fetchStatusField,
  hasProjectScope,
  type LinkedBoard,
  PmError,
  parseOrigin,
  type Runner,
  type StatusField,
  versionAtLeast,
} from './pm-data.js';
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
export interface BoardInfo {
  tracked: boolean;
  reason: NotTrackedReason | null;
  owner: string | null;
  repo: string | null;
  project: { number: number; id: string; url: string; title: string } | null;
  status_field: StatusField | null;
  linked: LinkedBoard[];
  preflight: Preflight;
  root: string;
}

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
  const info: BoardInfo = {
    tracked: false,
    reason: null,
    owner: null,
    repo: null,
    project: null,
    status_field: null,
    linked: [],
    preflight: preflightOf(gh.version),
    root,
  };
  const origin = run('git', ['remote', 'get-url', 'origin'], root);
  if (origin.code !== 0) return { ...info, reason: 'no-origin' };
  const parsed = parseOrigin(origin.stdout);
  if (!parsed) return { ...info, reason: 'not-github' };
  info.owner = parsed.owner;
  info.repo = parsed.repo;
  const login = fetchLocalLogin(run, root);
  if (login !== parsed.owner) {
    return { ...info, reason: 'remote-owner-mismatch' };
  }

  info.preflight.project_scope = hasProjectScope(fetchScopeHeaders(run, root));
  if (!info.preflight.project_scope) {
    throw new PmError(
      2,
      "gh token lacks the 'project' scope; run: gh auth refresh -s project",
    );
  }
  const d = fetchDiscovery(run, root, parsed.owner, parsed.repo);
  info.linked = d.boards;
  const chosen = chooseBoard(d.boards, d.viewer, parsed.repo);
  if (chosen.length === 0) return { ...info, reason: 'no-board' };
  const first = chosen[0];
  const f = fetchStatusField(run, root, d.viewer, first.number);
  info.tracked = true;
  info.project = { number: first.number, id: f.id, url: f.url, title: f.title };
  info.status_field = f.statusField;
  return info;
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
    err(`${verb}: not implemented yet`);
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
