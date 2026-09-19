/**
 * Data access for `sidekick pm`: one runner boundary over `gh` and `git`,
 * the GraphQL documents, and pure parsers from their output to the shapes
 * the seat reasons about. Nothing here writes to GitHub.
 */
import { spawnSync } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type Runner = (
  cmd: 'gh' | 'git',
  args: string[],
  cwd: string,
) => RunResult;

/** Never a shell: arguments go straight to the binary. */
export const execRunner: Runner = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error) return { code: 127, stdout: '', stderr: r.error.message };
  return {
    code: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
};

/**
 * Exit code carried out of the data layer; `runPmCli` turns it into a
 * return.
 */
export class PmError extends Error {
  readonly exit: 1 | 2;
  constructor(exit: 1 | 2, message: string) {
    super(message);
    this.exit = exit;
  }
}

/**
 * What a fixture runner matches on: the command and its arguments, with a
 * GraphQL document reduced to its operation name so a test can name a call
 * as `gh api graphql -f query=query Items -f login=… -F number=2`.
 */
export function runnerKey(cmd: 'gh' | 'git', args: string[]): string {
  const shown = args.map((a) => {
    if (!a.startsWith('query=')) return a;
    const i = a.indexOf('(');
    return i < 0 ? a : a.slice(0, i);
  });
  return `${cmd} ${shown.join(' ')}`;
}

const ORIGIN =
  /^(?:git@github\.com:|https:\/\/github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/;

export function parseOrigin(
  url: string,
): { owner: string; repo: string } | null {
  const m = url.trim().match(ORIGIN);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export function parseGhVersion(firstLine: string): string | null {
  const m = firstLine.match(/^gh version (\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

export function versionAtLeast(v: string, min: string): boolean {
  const a = v.split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

export function hasProjectScope(headers: string): boolean {
  const line = headers.split(/\r?\n/).find((l) => /^x-oauth-scopes:/i.test(l));
  if (!line) return false;
  return line
    .slice(line.indexOf(':') + 1)
    .split(',')
    .map((s) => s.trim())
    .includes('project');
}

export function ageDays(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Seven days is prescriptive: an In Progress card older than that is a
 * question.
 */
export const STALE_DAYS = 7;

export interface LinkedBoard {
  number: number;
  title: string;
  closed: boolean;
  url: string;
  id: string;
  ownerLogin: string;
}
export interface StatusField {
  id: string;
  options: Record<string, string>;
}
export interface Item {
  itemId: string;
  status: string | null;
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  stateReason: string | null;
  updatedAt: string;
  url: string;
  milestone: string | null;
  labels: string[];
  assignees: string[];
  repo: string;
}
export interface ItemsPage {
  items: Item[];
  kinds: Record<string, number>;
  totalCount: number;
  hasNextPage: boolean;
  endCursor: string | null;
}
export interface Milestone {
  number: number;
  title: string;
  description: string;
  due_on: string | null;
  open_issues: number;
  closed_issues: number;
  state: 'open' | 'closed';
}
export interface Issue {
  number: number;
  title: string;
  labels: string[];
  body: string;
  milestone: string | null;
  updatedAt: string;
}

export const DISCOVERY_QUERY =
  'query Discovery($owner: String!, $name: String!) { viewer { login } repository(owner: $owner, name: $name) { projectsV2(first: 10) { nodes { number title closed url id owner { __typename ... on User { login } ... on Organization { login } } } } } }';
export const FIELD_QUERY =
  'query StatusField($login: String!, $number: Int!) { user(login: $login) { projectV2(number: $number) { id title url field(name: "Status") { ... on ProjectV2SingleSelectField { id name options { id name } } } } } }';
export const ITEMS_PAGE = 100;
export const ITEMS_QUERY = `query Items($login: String!, $number: Int!, $after: String) { user(login: $login) { projectV2(number: $number) { items(first: ${ITEMS_PAGE}, after: $after) { totalCount pageInfo { hasNextPage endCursor } nodes { id updatedAt fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } content { __typename ... on Issue { number title state stateReason updatedAt url milestone { title number } labels(first: 10) { nodes { name } } assignees(first: 5) { nodes { login } } repository { nameWithOwner } } ... on PullRequest { number repository { nameWithOwner } } ... on DraftIssue { title } } } } } } }`;
/** `gh issue list` truncates silently at `--limit`; hitting it is an error. */
export const ISSUE_LIMIT = 500;

type Var = ['-f' | '-F', string];

function gql(run: Runner, cwd: string, doc: string, vars: Var[]): unknown {
  const args = ['api', 'graphql', '-f', `query=${doc}`];
  for (const [flag, kv] of vars) args.push(flag, kv);
  const r = run('gh', args, cwd);
  if (r.code !== 0) {
    throw new PmError(1, r.stderr.trim() || 'gh api graphql failed');
  }
  const parsed = JSON.parse(r.stdout) as {
    data?: unknown;
    errors?: Array<{ message: string }>;
  };
  if (parsed.errors?.length) throw new PmError(1, parsed.errors[0].message);
  return parsed.data;
}

function rest(run: Runner, cwd: string, args: string[]): string {
  const r = run('gh', args, cwd);
  if (r.code !== 0) {
    throw new PmError(1, r.stderr.trim() || `gh ${args[0]} failed`);
  }
  return r.stdout;
}

export function fetchGhVersion(
  run: Runner,
  cwd: string,
): { found: boolean; version: string | null } {
  const r = run('gh', ['--version'], cwd);
  if (r.code !== 0) return { found: false, version: null };
  return {
    found: true,
    version: parseGhVersion(r.stdout.split('\n')[0] ?? ''),
  };
}

/** Reads `~/.config/gh/hosts.yml`; no request is made. */
export function fetchLocalLogin(run: Runner, cwd: string): string | null {
  const r = run('gh', ['config', 'get', '-h', 'github.com', 'user'], cwd);
  const v = r.stdout.trim();
  return r.code === 0 && v ? v : null;
}

export function fetchScopeHeaders(run: Runner, cwd: string): string {
  return rest(run, cwd, ['api', '-i', 'user']);
}

interface DiscoveryData {
  viewer: { login: string };
  repository: {
    projectsV2: {
      nodes: Array<{
        number: number;
        title: string;
        closed: boolean;
        url: string;
        id: string;
        owner: { login?: string };
      }>;
    };
  } | null;
}

export function parseDiscovery(data: unknown): {
  viewer: string;
  boards: LinkedBoard[];
} {
  const d = data as DiscoveryData;
  const nodes = d.repository?.projectsV2.nodes ?? [];
  return {
    viewer: d.viewer.login,
    boards: nodes.map((n) => ({
      number: n.number,
      title: n.title,
      closed: n.closed,
      url: n.url,
      id: n.id,
      ownerLogin: n.owner.login ?? '',
    })),
  };
}

export function fetchDiscovery(
  run: Runner,
  cwd: string,
  owner: string,
  repo: string,
): { viewer: string; boards: LinkedBoard[] } {
  return parseDiscovery(
    gql(run, cwd, DISCOVERY_QUERY, [
      ['-f', `owner=${owner}`],
      ['-f', `name=${repo}`],
    ]),
  );
}

interface FieldData {
  user: {
    projectV2: {
      id: string;
      title: string;
      url: string;
      field: {
        id: string;
        options: Array<{ id: string; name: string }>;
      } | null;
    };
  };
}

export function parseStatusField(data: unknown): {
  id: string;
  title: string;
  url: string;
  statusField: StatusField | null;
} {
  const p = (data as FieldData).user.projectV2;
  const statusField = p.field
    ? {
        id: p.field.id,
        options: Object.fromEntries(p.field.options.map((o) => [o.name, o.id])),
      }
    : null;
  return { id: p.id, title: p.title, url: p.url, statusField };
}

export function fetchStatusField(
  run: Runner,
  cwd: string,
  login: string,
  number: number,
): ReturnType<typeof parseStatusField> {
  return parseStatusField(
    gql(run, cwd, FIELD_QUERY, [
      ['-f', `login=${login}`],
      ['-F', `number=${number}`],
    ]),
  );
}

interface ItemsData {
  user: {
    projectV2: {
      items: {
        totalCount: number;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          updatedAt: string;
          fieldValueByName: { name?: string } | null;
          content: {
            __typename: string;
            number?: number;
            title?: string;
            state?: 'OPEN' | 'CLOSED';
            stateReason?: string | null;
            updatedAt?: string;
            url?: string;
            milestone?: { title: string } | null;
            labels?: { nodes: Array<{ name: string }> };
            assignees?: { nodes: Array<{ login: string }> };
            repository?: { nameWithOwner: string };
          } | null;
        }>;
      };
    };
  };
}

/** Keeps issues of `fullName` only; counts every kind it saw in `kinds`. */
export function parseItemsPage(data: unknown, fullName: string): ItemsPage {
  const page = (data as ItemsData).user.projectV2.items;
  const kinds: Record<string, number> = {};
  const items: Item[] = [];
  for (const n of page.nodes) {
    const c = n.content;
    const kind = c?.__typename ?? 'Unknown';
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    if (!c || kind !== 'Issue' || c.repository?.nameWithOwner !== fullName) {
      continue;
    }
    items.push({
      itemId: n.id,
      status: n.fieldValueByName?.name ?? null,
      number: c.number ?? 0,
      title: c.title ?? '',
      state: c.state ?? 'OPEN',
      stateReason: c.stateReason ?? null,
      updatedAt: c.updatedAt ?? n.updatedAt,
      url: c.url ?? '',
      milestone: c.milestone?.title ?? null,
      labels: (c.labels?.nodes ?? []).map((l) => l.name),
      assignees: (c.assignees?.nodes ?? []).map((a) => a.login),
      repo: c.repository?.nameWithOwner ?? '',
    });
  }
  return {
    items,
    kinds,
    totalCount: page.totalCount,
    hasNextPage: page.pageInfo.hasNextPage,
    endCursor: page.pageInfo.endCursor,
  };
}

export function fetchItems(
  run: Runner,
  cwd: string,
  login: string,
  number: number,
  fullName: string,
): { items: Item[]; kinds: Record<string, number>; totalCount: number } {
  const items: Item[] = [];
  const kinds: Record<string, number> = {};
  let totalCount = 0;
  let after: string | null = null;
  for (;;) {
    const vars: Var[] = [
      ['-f', `login=${login}`],
      ['-F', `number=${number}`],
    ];
    if (after) vars.push(['-f', `after=${after}`]);
    const page = parseItemsPage(gql(run, cwd, ITEMS_QUERY, vars), fullName);
    items.push(...page.items);
    for (const [k, v] of Object.entries(page.kinds)) {
      kinds[k] = (kinds[k] ?? 0) + v;
    }
    totalCount = page.totalCount;
    if (!page.hasNextPage || !page.endCursor) break;
    after = page.endCursor;
  }
  return { items, kinds, totalCount };
}

interface RestMilestone {
  number: number;
  title: string;
  description: string | null;
  due_on: string | null;
  open_issues: number;
  closed_issues: number;
  state: 'open' | 'closed';
}

export function parseMilestones(json: string): Milestone[] {
  return (JSON.parse(json) as RestMilestone[]).map((m) => ({
    number: m.number,
    title: m.title,
    description: m.description ?? '',
    due_on: m.due_on,
    open_issues: m.open_issues,
    closed_issues: m.closed_issues,
    state: m.state,
  }));
}

export function fetchMilestones(
  run: Runner,
  cwd: string,
  owner: string,
  repo: string,
  state: 'open' | 'closed',
): Milestone[] {
  return parseMilestones(
    rest(run, cwd, [
      'api',
      `repos/${owner}/${repo}/milestones?state=${state}&per_page=100`,
    ]),
  );
}

interface CliIssue {
  number: number;
  title: string;
  labels: Array<{ name: string }>;
  body: string;
  milestone: { title: string } | null;
  updatedAt: string;
}

export function parseIssues(json: string): Issue[] {
  const list = JSON.parse(json) as CliIssue[];
  if (list.length >= ISSUE_LIMIT) {
    throw new PmError(
      1,
      `gh issue list returned ${list.length} issues, the limit; refusing to reason over a truncated list`,
    );
  }
  return list.map((i) => ({
    number: i.number,
    title: i.title,
    labels: i.labels.map((l) => l.name),
    body: i.body,
    milestone: i.milestone?.title ?? null,
    updatedAt: i.updatedAt,
  }));
}

export function fetchOpenIssues(
  run: Runner,
  cwd: string,
  owner: string,
  repo: string,
): Issue[] {
  return parseIssues(
    rest(run, cwd, [
      'issue',
      'list',
      '-R',
      `${owner}/${repo}`,
      '--state',
      'open',
      '--limit',
      String(ISSUE_LIMIT),
      '--json',
      'number,title,labels,body,milestone,updatedAt',
    ]),
  );
}
