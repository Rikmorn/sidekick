import { describe, expect, test } from 'bun:test';
import {
  fixture,
  fixtureRunner,
  plansHeader,
  sidekickMap,
} from './fixtures/pm/runner.js';
import {
  activeMilestone,
  chooseBoard,
  discover,
  drift,
  GH_MIN,
  gateVerdict,
  inProgressMilestones,
  PM_USAGE,
  runPmCli,
  tiers,
} from './pm.js';
import { type BriefInput, renderBrief } from './pm-brief.js';
import type { Item, LinkedBoard, Milestone } from './pm-data.js';
import { LINT_IDS } from './pm-lint.js';
import type { Plans } from './pm-plans.js';

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
  created_at: '2026-09-01T00:00:00Z',
});
const item = (p: Partial<Item> & { number: number }): Item => ({
  itemId: `PVTI_${p.number}`,
  status: 'Backlog',
  title: `t${p.number}`,
  state: 'OPEN',
  stateReason: null,
  updatedAt: '2026-09-01T00:00:00Z',
  statusUpdatedAt: null,
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
  const ip = (number: number, milestone: string | null): Item =>
    item({ number, status: 'In Progress', milestone });
  test('the one open milestone holding In Progress cards, whatever the due dates', () => {
    const open = [ms(8, 'R8'), ms(9, 'R9', '2026-10-01T00:00:00Z')];
    expect(activeMilestone(open, [ip(1, 'R8')])?.title).toBe('R8');
    expect(activeMilestone(open, [ip(1, 'R9'), ip(2, null)])?.title).toBe('R9');
  });
  test('the only open milestone, with or without In Progress cards', () => {
    expect(activeMilestone([ms(8, 'R8')], [])?.title).toBe('R8');
    expect(activeMilestone([ms(8, 'R8')], [ip(1, null)])?.title).toBe('R8');
  });
  test('none when the board cannot say: two open and nothing In Progress, or a split', () => {
    const open = [ms(8, 'R8'), ms(9, 'R9')];
    expect(activeMilestone(open, [])).toBeNull();
    expect(activeMilestone(open, [ip(1, null)])).toBeNull();
    expect(activeMilestone(open, [ip(1, 'R8'), ip(2, 'R9')])).toBeNull();
    expect(activeMilestone([], [])).toBeNull();
  });
  test('a closed In Progress card, or one in a milestone not open, is no signal', () => {
    const open = [ms(8, 'R8'), ms(9, 'R9')];
    const closed = item({
      number: 1,
      status: 'In Progress',
      state: 'CLOSED',
      milestone: 'R8',
    });
    expect(activeMilestone(open, [closed, ip(2, 'R9')])?.title).toBe('R9');
    expect(activeMilestone(open, [ip(1, 'R5'), ip(2, 'R9')])?.title).toBe('R9');
  });
});

describe('inProgressMilestones', () => {
  test('the open milestones holding open In Progress cards, by number', () => {
    const open = [ms(9, 'R9'), ms(8, 'R8'), ms(10, 'R10')];
    const items = [
      item({ number: 1, status: 'In Progress', milestone: 'R9' }),
      item({ number: 2, status: 'In Progress', milestone: 'R8' }),
      item({ number: 3, status: 'In Progress', milestone: 'R9' }),
      item({ number: 4, status: 'Backlog', milestone: 'R10' }),
    ];
    expect(inProgressMilestones(open, items).map((m) => m.title)).toEqual([
      'R8',
      'R9',
    ]);
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
  test("an In Progress card's age counts from the later of its issue update and its move", () => {
    const t = tiers(
      [
        item({
          number: 1,
          status: 'In Progress',
          updatedAt: '2026-09-09T00:00:00Z',
          statusUpdatedAt: '2026-09-19T00:00:00Z',
        }),
        item({
          number: 2,
          status: 'In Progress',
          updatedAt: '2026-09-19T00:00:00Z',
          statusUpdatedAt: '2026-09-09T00:00:00Z',
        }),
        item({
          number: 3,
          status: 'In Progress',
          updatedAt: '2026-09-09T00:00:00Z',
        }),
      ],
      null,
      now,
    );
    expect(t.in_progress.map((i) => [i.number, i.age_days])).toEqual([
      [1, 0],
      [2, 0],
      [3, 10],
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

describe('runPmCli pickup plans', () => {
  const pickupWith = (description: string | null) => {
    const map = sidekickMap();
    if (description !== null) {
      const open = JSON.parse(fixture('milestones-open.json')) as Array<
        Record<string, unknown>
      >;
      open[0].description = description;
      map['gh api repos/Rikmorn/sidekick/milestones?state=open&per_page=100'] =
        JSON.stringify(open);
    }
    const c = capture();
    const code = runPmCli(
      ['pickup'],
      {
        cwd: '/',
        run: fixtureRunner(map),
        now: new Date('2026-09-19T12:00:00Z'),
      },
      c.o,
      c.e,
    );
    expect(code).toBe(0);
    return JSON.parse(c.out[0]) as {
      milestone: { created_at: string };
      plans: Plans;
    };
  };

  test("carries the active milestone's plans from its header, with each card's state", () => {
    const j = pickupWith(
      plansHeader('Seat (#109, #110)', 'Orient (#111, #112)'),
    );
    expect(j.milestone.created_at).toBe('2026-09-19T14:29:56Z');
    expect(j.plans.parse).toBe('ok');
    expect(
      j.plans.list.map((p) => [
        p.name,
        p.state,
        p.issues.map((i) => [i.number, i.status]),
      ]),
    ).toEqual([
      [
        'Seat',
        'running',
        [
          [109, 'In Progress'],
          [110, 'Backlog'],
        ],
      ],
      [
        'Orient',
        'next',
        [
          [111, 'Backlog'],
          [112, 'Backlog'],
        ],
      ],
    ]);
    expect(j.plans.unplanned.map((i) => i.number)).toEqual([113]);
  });

  test("R6's captured description has no header, so plans parse as none", () => {
    expect(pickupWith(null).plans).toEqual({
      parse: 'none',
      list: [],
      unplanned: [],
    });
  });
});

describe('pickup --report', () => {
  const run = (description: string | null, args: string[]) => {
    const map = sidekickMap();
    const open = JSON.parse(fixture('milestones-open.json')) as Array<
      Record<string, unknown>
    >;
    if (description !== null) open[0].description = description;
    map['gh api repos/Rikmorn/sidekick/milestones?state=open&per_page=100'] =
      JSON.stringify(description === 'no milestone' ? [] : open);
    const c = capture();
    const code = runPmCli(
      ['pickup', ...args],
      {
        cwd: '/',
        run: fixtureRunner(map),
        now: new Date('2026-09-19T12:00:00Z'),
      },
      c.o,
      c.e,
    );
    return { code, out: c.out, err: c.err };
  };

  test('prints the status-update body for a parsed header and exits 0', () => {
    const r = run(plansHeader('Seat (#109, #110)', 'Orient (#111, #112)'), [
      '--report',
    ]);
    expect(r.code).toBe(0);
    expect(r.err).toEqual([]);
    expect(r.out).toHaveLength(1);
    expect(r.out[0].split('\n')).toEqual([
      '**R6 — PM layer** · 5 open, 0 closed',
      'Running: **Seat**',
      '',
      '| | Plan | Closed | Issues |',
      '|---|---|---|---|',
      '| running | Seat | 0 of 2 | Rikmorn/sidekick#109 Rikmorn/sidekick#110 |',
      '| next | Orient | 0 of 2 | Rikmorn/sidekick#111 Rikmorn/sidekick#112 |',
      '',
      'Unplanned: Rikmorn/sidekick#113.',
    ]);
  });

  test('exits 1 with its reason, printing nothing, when there is nothing sound to post', () => {
    const cases: Array<[string | null, string]> = [
      [null, 'milestone "R6 — PM layer" has no plans header'],
      [
        plansHeader('A (#109)', 'A (#110)'),
        'milestone "R6 — PM layer": plan "A" appears twice',
      ],
      ['no milestone', 'no open milestone to report on'],
    ];
    for (const [description, reason] of cases) {
      const r = run(description, ['--report']);
      expect(r.code).toBe(1);
      expect(r.out).toEqual([]);
      expect(r.err).toEqual([reason]);
    }
  });

  test('--report in an untracked repo exits 1, and with --brief it is a usage error', () => {
    const c = capture();
    expect(
      runPmCli(
        ['pickup', '--report'],
        { cwd: '/', run: untracked() },
        c.o,
        c.e,
      ),
    ).toBe(1);
    expect(c.out).toEqual([]);
    expect(c.err).toEqual(['not tracked: remote-owner-mismatch']);
    const r = run(null, ['--brief', '--report']);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([PM_USAGE]);
  });
});

describe('pickup with several open milestones', () => {
  // The captured board's one In Progress card, #109, sits in R6.
  const r6 = (): Record<string, unknown> =>
    (
      JSON.parse(fixture('milestones-open.json')) as Array<
        Record<string, unknown>
      >
    )[0];
  const other = (number: number, title: string, due_on: string | null) => ({
    ...r6(),
    number,
    title,
    due_on,
    description: plansHeader('Other (#1)'),
  });
  const run = (open: unknown[], args: string[]) => {
    const map = sidekickMap();
    map['gh api repos/Rikmorn/sidekick/milestones?state=open&per_page=100'] =
      JSON.stringify(open);
    const c = capture();
    const code = runPmCli(
      ['pickup', ...args],
      {
        cwd: '/',
        run: fixtureRunner(map),
        now: new Date('2026-09-19T12:00:00Z'),
      },
      c.o,
      c.e,
    );
    return { code, out: c.out, err: c.err };
  };
  const json = (out: string[]) =>
    JSON.parse(out[0]) as {
      milestone: { title: string } | null;
      open_milestones: Array<{ number: number; title: string }>;
      drift: { in_progress_split: string[] };
      candidates: Array<{ tier: number }>;
    };

  test('In Progress decides over an earlier due date, and the report follows it', () => {
    const open = [
      { ...r6(), description: plansHeader('Seat (#109, #110)') },
      other(7, 'R7 — Earlier', '2026-09-01T00:00:00Z'),
    ];
    const j = json(run(open, []).out);
    expect(j.milestone?.title).toBe('R6 — PM layer');
    expect(j.open_milestones).toEqual([
      { number: 6, title: 'R6 — PM layer' },
      { number: 7, title: 'R7 — Earlier' },
    ]);
    expect(j.drift.in_progress_split).toEqual([]);
    const brief = run(open, ['--brief']).out[0].split('\n');
    expect(brief[1]).toMatch(/^milestone: R6 — PM layer \(5 open, 0 closed\)/);
    expect(brief[1]).toMatch(/ · also open: R7 — Earlier$/);
    const report = run(open, ['--report']);
    expect(report.code).toBe(0);
    expect(report.out[0].split('\n')[0]).toBe(
      '**R6 — PM layer** · 5 open, 0 closed',
    );
  });

  test('--milestone names an open milestone over the In Progress one', () => {
    const open = [r6(), other(7, 'R7 — Earlier', null)];
    expect(
      json(run(open, ['--milestone', 'R7 — Earlier']).out).milestone?.title,
    ).toBe('R7 — Earlier');
    const report = run(open, ['--report', '--milestone', 'R7 — Earlier']);
    expect(report.code).toBe(0);
    expect(report.out[0].split('\n')[0]).toBe(
      '**R7 — Earlier** · 5 open, 0 closed',
    );
  });

  test('an unknown --milestone exits 1 naming the open titles, and a missing value is a usage error', () => {
    const open = [r6(), other(7, 'R7 — Earlier', null)];
    const unknown = run(open, ['--milestone', 'R5 — Gone']);
    expect(unknown.code).toBe(1);
    expect(unknown.out).toEqual([]);
    expect(unknown.err).toEqual([
      'no open milestone titled "R5 — Gone"; open: R6 — PM layer, R7 — Earlier',
    ]);
    const missing = run(open, ['--milestone']);
    expect(missing.code).toBe(1);
    expect(missing.err).toEqual([PM_USAGE]);
  });

  test('with no In Progress card in an open milestone, two open name none, and --report says why', () => {
    // GitHub sorts milestones by due date; pickup lists them by number.
    const open = [other(9, 'R9 — B', null), other(7, 'R7 — A', null)];
    const j = json(run(open, []).out);
    expect(j.milestone).toBeNull();
    expect(j.open_milestones.map((m) => m.number)).toEqual([7, 9]);
    expect(j.candidates.every((c) => c.tier === 2)).toBe(true);
    const brief = run(open, ['--brief']).out[0].split('\n');
    expect(brief[1]).toBe('milestone: none active · open: R7 — A, R9 — B');
    expect(brief[5]).toBe('next: choose a milestone: R7 — A, R9 — B');
    const report = run(open, ['--report']);
    expect(report.code).toBe(1);
    expect(report.out).toEqual([]);
    expect(report.err).toEqual([
      'no active milestone among 2 open (R7 — A, R9 — B); pass --milestone',
    ]);
  });

  test('In Progress split across two open milestones names none, and drift reports the split', () => {
    const map = sidekickMap();
    const p2 = JSON.parse(fixture('items-p2.json')) as {
      data: {
        user: {
          projectV2: {
            items: {
              nodes: Array<{
                fieldValueByName: { name?: string } | null;
                content: {
                  number?: number;
                  state?: string;
                  milestone?: { title: string } | null;
                } | null;
              }>;
            };
          };
        };
      };
    };
    const node = p2.data.user.projectV2.items.nodes.find(
      (n) => n.content?.number === 114,
    );
    if (!node?.content) throw new Error('fixture lacks #114');
    node.fieldValueByName = { name: 'In Progress' };
    node.content.milestone = { title: 'R7 — Earlier' };
    for (const [key, body] of Object.entries(map)) {
      if (body === fixture('items-p2.json')) map[key] = JSON.stringify(p2);
    }
    map['gh api repos/Rikmorn/sidekick/milestones?state=open&per_page=100'] =
      JSON.stringify([r6(), other(7, 'R7 — Earlier', null)]);
    const c = capture();
    runPmCli(
      ['pickup'],
      {
        cwd: '/',
        run: fixtureRunner(map),
        now: new Date('2026-09-19T12:00:00Z'),
      },
      c.o,
      c.e,
    );
    const j = json(c.out);
    expect(j.milestone).toBeNull();
    expect(j.drift.in_progress_split).toEqual([
      'R6 — PM layer',
      'R7 — Earlier',
    ]);
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
