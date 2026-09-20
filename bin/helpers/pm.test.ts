import { describe, expect, test } from 'bun:test';
import { fixture, fixtureRunner, sidekickMap } from './fixtures/pm/runner.js';
import {
  activeMilestone,
  chooseBoard,
  discover,
  drift,
  GH_MIN,
  gateVerdict,
  PM_USAGE,
  runPmCli,
  tiers,
} from './pm.js';
import { type BriefInput, renderBrief } from './pm-brief.js';
import type { Item, LinkedBoard, Milestone } from './pm-data.js';
import { LINT_IDS } from './pm-lint.js';

const board = (
  n: number,
  title: string,
  closed = false,
  owner = 'Rikmorn',
): LinkedBoard => ({
  number: n,
  title,
  closed,
  url: `https://github.com/users/${owner}/projects/${n}`,
  id: `PVT_${n}`,
  ownerLogin: owner,
});
const ms = (
  number: number,
  title: string,
  due_on: string | null = null,
): Milestone => ({
  number,
  title,
  description: '',
  due_on,
  open_issues: 1,
  closed_issues: 0,
  state: 'open',
});
const item = (p: Partial<Item> & { number: number }): Item => ({
  itemId: `PVTI_${p.number}`,
  status: 'Backlog',
  title: `t${p.number}`,
  state: 'OPEN',
  stateReason: null,
  updatedAt: '2026-09-01T00:00:00Z',
  url: '',
  milestone: null,
  labels: [],
  assignees: [],
  repo: 'Rikmorn/sidekick',
  ...p,
});
const issue6 = (number: number, milestone: string | null) => ({
  number,
  title: `t${number}`,
  labels: ['area:pm'],
  body: '',
  milestone,
  updatedAt: '2026-09-01T00:00:00Z',
});
const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    o: (l: string) => out.push(l),
    e: (l: string) => err.push(l),
  };
};

interface RawItemNode {
  fieldValueByName: { name?: string } | null;
  content: {
    __typename: string;
    number?: number;
    state?: 'OPEN' | 'CLOSED';
    milestone?: { title: string } | null;
    labels?: { nodes: Array<{ name: string }> };
    assignees?: { nodes: Array<{ login: string }> };
    repository?: { nameWithOwner: string };
  } | null;
}
interface FixtureIssue {
  number: number;
  status: string | null;
  milestone: string | null;
  labels: string[];
  assignees: string[];
}
/**
 * Open `Issue` cards of `Rikmorn/sidekick`, independently parsed from the
 * committed `items-p1`/`items-p2` fixtures — the same source `fetchItems`
 * reads, but computed without calling production code, so a `tiers` or
 * `runPmCli` assertion built from this cannot be vacuous by construction.
 */
const openIssues = (): FixtureIssue[] => {
  const nodes = ['items-p1.json', 'items-p2.json'].flatMap(
    (name) =>
      (
        JSON.parse(fixture(name)) as {
          data: { user: { projectV2: { items: { nodes: RawItemNode[] } } } };
        }
      ).data.user.projectV2.items.nodes,
  );
  return nodes
    .filter(
      (
        n,
      ): n is RawItemNode & {
        content: NonNullable<RawItemNode['content']> & { number: number };
      } =>
        n.content?.__typename === 'Issue' &&
        n.content.repository?.nameWithOwner === 'Rikmorn/sidekick' &&
        n.content.state === 'OPEN' &&
        n.content.number !== undefined,
    )
    .map((n) => ({
      number: n.content.number,
      status: n.fieldValueByName?.name ?? null,
      milestone: n.content.milestone?.title ?? null,
      labels: (n.content.labels?.nodes ?? []).map((l) => l.name),
      assignees: (n.content.assignees?.nodes ?? []).map((a) => a.login),
    }));
};
const untracked = () =>
  fixtureRunner({
    'gh --version': 'gh version 2.96.0 (2026-07-02)\n',
    'git remote get-url origin': 'git@github.com:acme/work.git\n',
    'gh config get -h github.com user': 'Rikmorn\n',
  });

describe('chooseBoard', () => {
  test('keeps open boards owned by the viewer and titled after the repo, lowest number first', () => {
    const boards = [
      board(3, 'sidekick'),
      board(1, "@Rikmorn's untitled project", true),
      board(2, 'sidekick'),
      board(4, 'sidekick', false, 'someone-else'),
      board(5, 'other'),
    ];
    expect(
      chooseBoard(boards, 'Rikmorn', 'sidekick').map((b) => b.number),
    ).toEqual([2, 3]);
  });
  test('empty when nothing matches', () => {
    expect(chooseBoard([board(1, 'x')], 'Rikmorn', 'sidekick')).toEqual([]);
  });
});

describe('discover', () => {
  test('sidekick is tracked on board #2 with the four Status options', () => {
    const info = discover(fixtureRunner(sidekickMap()), '/');
    expect(info.tracked).toBe(true);
    expect(info.reason).toBeNull();
    expect(info.owner).toBe('Rikmorn');
    expect(info.repo).toBe('sidekick');
    if (!info.tracked) throw new Error('expected tracked');
    // `viewer` is the GraphQL identity threaded into the later `user(login:)`
    // queries; it must come from `d.viewer`, not a second local-login read.
    expect(info.viewer).toBe('Rikmorn');
    expect(info.project?.number).toBe(2);
    expect(Object.keys(info.status_field?.options ?? {}).sort()).toEqual([
      'Backlog',
      'Done',
      'In Progress',
      'Verify',
    ]);
    expect(info.preflight.gh_min).toBe(GH_MIN);
    expect(info.preflight.project_scope).toBe(true);
  });
  test('the local guard stops before any network call when the remote owner is not the user', () => {
    const info = discover(untracked(), '/');
    expect(info.tracked).toBe(false);
    expect(info.reason).toBe('remote-owner-mismatch');
  });
  test('a missing local login is its own reason, not a false remote-owner-mismatch', () => {
    const info = discover(
      fixtureRunner({
        'gh --version': 'gh version 2.96.0 (2026-07-02)\n',
        'git remote get-url origin': 'git@github.com:Rikmorn/sidekick.git\n',
        'gh config get -h github.com user': {
          code: 1,
          stdout: '',
          stderr: 'no such key\n',
        },
      }),
      '/',
    );
    expect(info.tracked).toBe(false);
    expect(info.reason).toBe('no-local-login');
  });
  test('no origin, not github, and no board each name their reason', () => {
    const base = {
      'gh --version': 'gh version 2.96.0 (2026-07-02)\n',
      'gh config get -h github.com user': 'Rikmorn\n',
      'gh api -i user': 'HTTP/2.0 200 OK\nX-Oauth-Scopes: project, repo\n',
    };
    expect(
      discover(
        fixtureRunner({
          ...base,
          'git remote get-url origin': {
            code: 2,
            stdout: '',
            stderr: "error: No such remote 'origin'",
          },
        }),
        '/',
      ).reason,
    ).toBe('no-origin');
    expect(
      discover(
        fixtureRunner({
          ...base,
          'git remote get-url origin': 'git@gitlab.com:Rikmorn/x.git\n',
        }),
        '/',
      ).reason,
    ).toBe('not-github');
    const map = sidekickMap();
    map['git remote get-url origin'] = 'git@github.com:Rikmorn/furnace.git\n';
    map[
      'gh api graphql -f query=query Discovery -f owner=Rikmorn -f name=furnace'
    ] =
      '{"data":{"viewer":{"login":"Rikmorn"},"repository":{"projectsV2":{"nodes":[]}}}}';
    expect(discover(fixtureRunner(map), '/').reason).toBe('no-board');
  });
  test('gh below the minimum is a warning, not a failure', () => {
    const info = discover(fixtureRunner(sidekickMap()), '/');
    expect(info.preflight.gh_version).toBe('2.96.0');
    expect(info.preflight.gh_ok).toBe(false);
    expect(info.preflight.warnings.join(' ')).toContain('2.98.0');
  });
  test('a board missing its Status field is tracked with status_field null', () => {
    const map = sidekickMap();
    map[
      'gh api graphql -f query=query StatusField -f login=Rikmorn -F number=2'
    ] =
      '{"data":{"user":{"projectV2":{"id":"x","title":"sidekick","url":"u","field":null}}}}';
    const info = discover(fixtureRunner(map), '/');
    expect(info.tracked).toBe(true);
    expect(info.status_field).toBeNull();
  });
});

describe('runPmCli board', () => {
  test('prints one JSON object and exits 0 when tracked', () => {
    const c = capture();
    const code = runPmCli(
      ['board'],
      { cwd: '/', run: fixtureRunner(sidekickMap()) },
      c.o,
      c.e,
    );
    expect(code).toBe(0);
    expect(c.out.length).toBe(1);
    const j = JSON.parse(c.out[0]) as {
      tracked: boolean;
      project: { number: number };
    };
    expect(j.tracked).toBe(true);
    expect(j.project.number).toBe(2);
    expect('root' in j).toBe(false);
  });
  test('--quiet prints nothing and exits 0 when not tracked', () => {
    const c = capture();
    expect(
      runPmCli(['board', '--quiet'], { cwd: '/', run: untracked() }, c.o, c.e),
    ).toBe(0);
    expect(c.out).toEqual([]);
    expect(c.err).toEqual([]);
  });
  test('without --quiet, not tracked still prints the JSON with its reason', () => {
    const c = capture();
    expect(runPmCli(['board'], { cwd: '/', run: untracked() }, c.o, c.e)).toBe(
      0,
    );
    expect((JSON.parse(c.out[0]) as { reason: string }).reason).toBe(
      'remote-owner-mismatch',
    );
  });
  test('missing gh is exit 2; missing project scope is exit 2', () => {
    const c1 = capture();
    expect(
      runPmCli(
        ['board'],
        {
          cwd: '/',
          run: fixtureRunner({
            'gh --version': { code: 127, stdout: '', stderr: 'ENOENT' },
          }),
        },
        c1.o,
        c1.e,
      ),
    ).toBe(2);
    expect(c1.err.join(' ')).toContain('gh');
    const map = sidekickMap();
    map['gh api -i user'] = 'HTTP/2.0 200 OK\nX-Oauth-Scopes: repo\n';
    const c2 = capture();
    expect(
      runPmCli(['board'], { cwd: '/', run: fixtureRunner(map) }, c2.o, c2.e),
    ).toBe(2);
    expect(c2.err.join(' ')).toContain('project');
  });
  test('an unknown verb prints usage and exits 1', () => {
    const c = capture();
    expect(
      runPmCli(['nope'], { cwd: '/', run: fixtureRunner({}) }, c.o, c.e),
    ).toBe(1);
    expect(c.err).toEqual([PM_USAGE]);
  });
  // `bin/cli.ts` has no top-level handler, so an error that is not a
  // `PmError` — malformed JSON from `gh`, say — must still exit cleanly
  // rather than crash with an uncaught stack trace.
  test('malformed JSON from a query is an unexpected error: exit 1, non-empty stderr', () => {
    const map = sidekickMap();
    map[
      'gh api graphql -f query=query Discovery -f owner=Rikmorn -f name=sidekick'
    ] = 'not json';
    const c = capture();
    const code = runPmCli(
      ['board'],
      { cwd: '/', run: fixtureRunner(map) },
      c.o,
      c.e,
    );
    expect(code).toBe(1);
    expect(c.err.join(' ').length).toBeGreaterThan(0);
  });
});

describe('activeMilestone', () => {
  test('earliest due_on first, nulls last', () => {
    expect(
      activeMilestone([ms(1, 'R7'), ms(2, 'R6', '2026-10-01T00:00:00Z')])
        ?.title,
    ).toBe('R6');
  });
  test('then a numeric-aware title order, then number', () => {
    expect(activeMilestone([ms(1, 'R10'), ms(2, 'R9')])?.title).toBe('R9');
    expect(activeMilestone([ms(5, 'same'), ms(3, 'same')])?.number).toBe(3);
  });
  test('none open is null', () => {
    expect(activeMilestone([])).toBeNull();
  });
});

describe('tiers', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  test('in progress, then the active milestone, then unmilestoned and not deferred', () => {
    const items = [
      // Out of number order on purpose: `in_progress` must sort, not just
      // preserve the order items arrived in.
      item({
        number: 7,
        status: 'In Progress',
        updatedAt: '2026-09-05T00:00:00Z',
        assignees: ['Someone'],
      }),
      item({
        number: 1,
        status: 'In Progress',
        updatedAt: '2026-09-10T00:00:00Z',
        assignees: ['Rikmorn'],
      }),
      item({ number: 9, milestone: 'R6' }),
      item({ number: 3 }),
      item({ number: 4, labels: ['backlog'] }),
      item({ number: 5, milestone: 'R7' }),
      item({ number: 6, status: 'Done', state: 'CLOSED' }),
    ];
    const t = tiers(items, ms(6, 'R6'), now);
    expect(t.in_progress.map((i) => i.number)).toEqual([1, 7]);
    expect(t.in_progress[0].age_days).toBe(9);
    expect(t.in_progress[1].age_days).toBe(14);
    expect(t.in_progress.map((i) => i.assignees)).toEqual([
      ['Rikmorn'],
      ['Someone'],
    ]);
    expect(t.candidates.map((c) => [c.tier, c.number])).toEqual([
      [1, 9],
      [2, 3],
    ]);
  });
  test('with no active milestone, tier 1 is empty and tier 2 still runs', () => {
    const t = tiers(
      [item({ number: 3 }), item({ number: 2, milestone: 'R6' })],
      null,
      now,
    );
    expect(t.candidates.map((c) => [c.tier, c.number])).toEqual([[2, 3]]);
  });
});

describe('drift', () => {
  test('falls back to origin/<branch> when the branch has no upstream', () => {
    const d = drift(fixtureRunner(sidekickMap()), '/', []);
    expect(d.unpushed).toEqual({ count: 0, basis: 'origin-branch' });
    expect(d.open_pr).toBeNull();
  });
  test('uses the upstream when configured', () => {
    const map = sidekickMap();
    map['git rev-parse --abbrev-ref @{u}'] = 'origin/master\n';
    map['git rev-list --count @{u}..HEAD'] = '3\n';
    expect(drift(fixtureRunner(map), '/', []).unpushed).toEqual({
      count: 3,
      basis: 'upstream',
    });
  });
  test('reports none when neither exists', () => {
    const map = sidekickMap();
    map['git rev-parse --verify --quiet refs/remotes/origin/master'] = {
      code: 1,
      stdout: '',
      stderr: '',
    };
    expect(drift(fixtureRunner(map), '/', []).unpushed).toEqual({
      count: null,
      basis: 'none',
    });
  });
  test('stale in progress is age over seven days; an open PR is reported', () => {
    const map = sidekickMap();
    map['gh pr list --head master --state open --json number,title'] =
      '[{"number":9,"title":"wip"}]';
    const d = drift(fixtureRunner(map), '/', [
      {
        number: 1,
        title: 'a',
        item_id: 'PVTI_1',
        age_days: 8,
        assignees: [],
        milestone: null,
      },
      {
        number: 2,
        title: 'b',
        item_id: 'PVTI_2',
        age_days: 7,
        assignees: [],
        milestone: null,
      },
    ]);
    expect(d.stale_in_progress.map((i) => i.number)).toEqual([1]);
    expect(d.open_pr).toEqual({ number: 9, title: 'wip' });
  });
});

describe('runPmCli pickup', () => {
  test('joins the board, the active milestone, and drift into one object', () => {
    const c = capture();
    const code = runPmCli(
      ['pickup'],
      {
        cwd: '/',
        run: fixtureRunner(sidekickMap()),
        now: new Date('2026-09-19T12:00:00Z'),
      },
      c.o,
      c.e,
    );
    expect(code).toBe(0);
    const j = JSON.parse(c.out[0]) as {
      board: { tracked: boolean; item_kinds: Record<string, number> };
      milestone: { title: string } | null;
      in_progress: Array<{
        number: number;
        item_id: string;
        assignees: string[];
        milestone: string | null;
      }>;
      candidates: Array<{ tier: number; number: number }>;
      order_basis: string;
      drift: { unpushed: { basis: string } };
    };
    expect(j.board.tracked).toBe(true);
    expect(j.order_basis).toBe('number');
    expect(j.drift.unpushed.basis).toBe('origin-branch');
    const open = JSON.parse(fixture('milestones-open.json')) as Array<{
      title: string;
    }>;
    expect(open.map((m) => m.title)).toContain(j.milestone?.title ?? '');
    const activeTitle = j.milestone?.title ?? null;

    const issues = openIssues();
    const expectedInProgress = issues
      .filter((i) => i.status === 'In Progress')
      .sort((a, b) => a.number - b.number);
    expect(expectedInProgress.length).toBeGreaterThan(0);
    expect(j.in_progress.map((i) => i.number)).toEqual(
      expectedInProgress.map((i) => i.number),
    );
    expect(j.in_progress[0].milestone).toBe(expectedInProgress[0].milestone);
    // `item_id` is the board item's node id (Task item 1, #109 follow-up):
    // every id `fetchItems` parses is a `PVTI_…` project-item id, never the
    // issue's own node id.
    expect(j.in_progress[0].item_id).toMatch(/^PVTI_/);

    const tier1 = issues
      .filter((i) => i.status === 'Backlog' && i.milestone === activeTitle)
      .map((i) => i.number)
      .sort((a, b) => a - b);
    const tier2 = issues
      .filter(
        (i) =>
          i.status === 'Backlog' &&
          i.milestone === null &&
          !i.labels.includes('backlog'),
      )
      .map((i) => i.number)
      .sort((a, b) => a - b);
    expect(j.candidates.map((c) => [c.tier, c.number])).toEqual([
      ...tier1.map((n) => [1, n]),
      ...tier2.map((n) => [2, n]),
    ]);
    // `item_kinds` tallies every node the Items page saw; its values must
    // sum to the same totalCount fetchItems reports.
    const p1 = JSON.parse(fixture('items-p1.json')) as {
      data: { user: { projectV2: { items: { totalCount: number } } } };
    };
    const kindsSum = Object.values(j.board.item_kinds).reduce(
      (a, b) => a + b,
      0,
    );
    expect(kindsSum).toBe(p1.data.user.projectV2.items.totalCount);
  });
});

describe('runPmCli lint', () => {
  test('prints findings and counts and exits 0 whatever the counts are', () => {
    // A second open board titled `sidekick` and owned by the viewer, so
    // `chooseBoard` has two matching candidates. This pins the wiring at
    // `runPmCli`'s `lint` verb, not just the `multipleLinkedBoards`
    // predicate: on the unmodified fixture there is exactly one matching
    // candidate, so `candidates: []` and the real call both read 0.
    const map = sidekickMap();
    const discoveryKey =
      'gh api graphql -f query=query Discovery -f owner=Rikmorn -f name=sidekick';
    const discovery = JSON.parse(fixture('discovery-sidekick.json')) as {
      data: {
        repository: {
          projectsV2: {
            nodes: Array<{
              number: number;
              title: string;
              closed: boolean;
              url: string;
              id: string;
              owner: { __typename: string; login: string };
            }>;
          };
        };
      };
    };
    discovery.data.repository.projectsV2.nodes.push({
      number: 99,
      title: 'sidekick',
      closed: false,
      url: 'https://github.com/users/Rikmorn/projects/99',
      id: 'PVT_99',
      owner: { __typename: 'User', login: 'Rikmorn' },
    });
    map[discoveryKey] = JSON.stringify(discovery);

    const c = capture();
    const code = runPmCli(
      ['lint'],
      { cwd: '/', run: fixtureRunner(map) },
      c.o,
      c.e,
    );
    expect(code).toBe(0);
    const j = JSON.parse(c.out[0]) as {
      board: { item_kinds: Record<string, number> };
      counts: Record<string, number>;
      findings: Record<string, unknown[]>;
    };
    expect(Object.keys(j.counts).sort()).toEqual(
      Object.keys(j.findings).sort(),
    );
    // Looks redundant with the equality above, since `counts` is built
    // from `LINT_IDS` — but `Object.keys` dedupes and `LINT_IDS` does not,
    // so this is the only check that would catch a duplicated id in
    // `LINT_IDS`, which typechecks clean.
    expect(Object.keys(j.counts).sort()).toEqual([...LINT_IDS].sort());
    expect(j.counts.multiple_linked_boards).toBe(1);
    // `item_kinds` tallies every node the Items page saw; its values must
    // sum to the same totalCount fetchItems reports (Task 6's `pickup`
    // asserts the same fixture-derived fact for its own `board` block).
    const p1 = JSON.parse(fixture('items-p1.json')) as {
      data: { user: { projectV2: { items: { totalCount: number } } } };
    };
    const kindsSum = Object.values(j.board.item_kinds).reduce(
      (a, b) => a + b,
      0,
    );
    expect(kindsSum).toBe(p1.data.user.projectV2.items.totalCount);
  });
});

describe('gateVerdict', () => {
  test('ready only when the milestone has no open issues; lists the open ones with Status', () => {
    const m = ms(6, 'R6');
    const issues = [issue6(2, 'R6'), issue6(1, 'R6'), issue6(3, 'R7')];
    const items = [item({ number: 1, status: 'In Progress' })];
    const v = gateVerdict({ ...m, open_issues: 2 }, issues, items);
    expect(v.ready).toBe(false);
    expect(v.open).toEqual([
      {
        number: 1,
        title: 't1',
        status: 'In Progress',
        item_id: 'PVTI_1',
        labels: ['area:pm'],
      },
      {
        number: 2,
        title: 't2',
        status: null,
        item_id: null,
        labels: ['area:pm'],
      },
    ]);
    expect(gateVerdict({ ...m, open_issues: 0 }, [], []).ready).toBe(true);
    // The two clauses of `ready` must each hold independently: REST's
    // `open_issues` and the issues-joined `open` list can disagree, and a
    // disagreement in either direction is not ready.
    expect(
      gateVerdict({ ...m, open_issues: 0 }, [issue6(1, 'R6')], []).ready,
    ).toBe(false);
    expect(gateVerdict({ ...m, open_issues: 3 }, [], []).ready).toBe(false);
  });
});

describe('runPmCli gate', () => {
  test('finds the milestone by title and reports readiness', () => {
    const c = capture();
    const open = JSON.parse(fixture('milestones-open.json')) as Array<{
      title: string;
      open_issues: number;
    }>;
    const title = open[0].title;
    // `open_issues` (REST) counts issues and PRs; `gateVerdict`'s `open`
    // array is issues only. Derive the expectation from the issues
    // fixture rather than the REST count, so the two quantities are not
    // conflated even though they agree on this fixture.
    const issues = JSON.parse(fixture('issues-open.json')) as Array<{
      milestone: { title: string } | null;
    }>;
    const openCount = issues.filter((i) => i.milestone?.title === title).length;
    const code = runPmCli(
      ['gate', '--milestone', title],
      { cwd: '/', run: fixtureRunner(sidekickMap()) },
      c.o,
      c.e,
    );
    expect(code).toBe(0);
    const j = JSON.parse(c.out[0]) as {
      milestone: { title: string };
      ready: boolean;
      open: unknown[];
    };
    expect(j.milestone.title).toBe(title);
    expect(j.open.length).toBe(openCount);
    expect(j.ready).toBe(open[0].open_issues === 0 && openCount === 0);
  });
  test('falls back to the closed set when the title is not open', () => {
    const c = capture();
    const closed = JSON.parse(fixture('milestones-closed.json')) as Array<{
      title: string;
      open_issues: number;
    }>;
    const title = closed[0].title;
    const issues = JSON.parse(fixture('issues-open.json')) as Array<{
      milestone: { title: string } | null;
    }>;
    const openCount = issues.filter((i) => i.milestone?.title === title).length;
    const code = runPmCli(
      ['gate', '--milestone', title],
      { cwd: '/', run: fixtureRunner(sidekickMap()) },
      c.o,
      c.e,
    );
    expect(code).toBe(0);
    const j = JSON.parse(c.out[0]) as {
      milestone: { title: string };
      ready: boolean;
      open: unknown[];
    };
    expect(j.milestone.title).toBe(title);
    expect(j.ready).toBe(closed[0].open_issues === 0 && openCount === 0);
  });
  test('an unknown title is exit 1 and names the open milestones', () => {
    const c = capture();
    const open = JSON.parse(fixture('milestones-open.json')) as Array<{
      title: string;
    }>;
    const code = runPmCli(
      ['gate', '--milestone', 'nope'],
      { cwd: '/', run: fixtureRunner(sidekickMap()) },
      c.o,
      c.e,
    );
    expect(code).toBe(1);
    expect(c.err.join(' ')).toContain(open[0].title);
  });
  test('gate without --milestone is a usage error', () => {
    const c = capture();
    expect(
      runPmCli(
        ['gate'],
        { cwd: '/', run: fixtureRunner(sidekickMap()) },
        c.o,
        c.e,
      ),
    ).toBe(1);
    expect(c.err).toEqual([PM_USAGE]);
  });
});

describe('pickup --brief', () => {
  test('renders the same join the JSON carries, as text', () => {
    const env = {
      cwd: '/',
      run: fixtureRunner(sidekickMap()),
      now: new Date('2026-09-19T12:00:00Z'),
    };
    const j = capture();
    expect(runPmCli(['pickup'], env, j.o, j.e)).toBe(0);
    const b = capture();
    expect(runPmCli(['pickup', '--brief'], env, b.o, b.e)).toBe(0);
    expect(b.out).toHaveLength(1);
    expect(b.out[0]).toBe(renderBrief(JSON.parse(j.out[0]) as BriefInput));
    expect(b.out[0]?.split('\n')[0]).toBe(
      'sidekick · Rikmorn/sidekick · board #2',
    );
    expect(b.out[0]?.split('\n')).toHaveLength(6);
  });
  test('--brief is silent in an untracked repo, like --quiet', () => {
    const c = capture();
    expect(
      runPmCli(['pickup', '--brief'], { cwd: '/', run: untracked() }, c.o, c.e),
    ).toBe(0);
    expect(c.out).toEqual([]);
    expect(c.err).toEqual([]);
  });
});
