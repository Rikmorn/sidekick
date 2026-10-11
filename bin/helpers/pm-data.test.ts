import { describe, expect, test } from 'bun:test';
import { fixture, fixtureRunner, sidekickMap } from './fixtures/pm/runner.js';
import { tiers } from './pm.js';
import {
  ageDays,
  cardedItems,
  execRunner,
  fetchDiscovery,
  fetchMilestones,
  fetchOpenIssues,
  fetchRepoIssues,
  fetchStatusField,
  hasProjectScope,
  ISSUE_LIMIT,
  milestoneCounts,
  PmError,
  parseDiscovery,
  parseGhVersion,
  parseIssues,
  parseMilestones,
  parseOrigin,
  parseRepoIssuesPage,
  parseStatusField,
  type Runner,
  runnerKey,
  touchedAt,
  versionAtLeast,
} from './pm-data.js';

describe('runnerKey', () => {
  test('reduces a GraphQL document to its operation name', () => {
    const doc = 'query Items($login: String!) { viewer { login } }';
    expect(
      runnerKey('gh', [
        'api',
        'graphql',
        '-f',
        `query=${doc}`,
        '-f',
        'login=x',
      ]),
    ).toBe('gh api graphql -f query=query Items -f login=x');
    expect(
      runnerKey('gh', [
        'api',
        'graphql',
        '-f',
        'query=query Viewer { viewer { login } }',
      ]),
    ).toBe('gh api graphql -f query=query Viewer { viewer { login } }');
  });
  test('leaves other arguments verbatim', () => {
    expect(runnerKey('git', ['rev-parse', '--abbrev-ref', '@{u}'])).toBe(
      'git rev-parse --abbrev-ref @{u}',
    );
  });
});

describe('parseOrigin', () => {
  test('ssh and https forms, with and without .git', () => {
    expect(parseOrigin('git@github.com:Rikmorn/sidekick.git\n')).toEqual({
      owner: 'Rikmorn',
      repo: 'sidekick',
    });
    expect(parseOrigin('https://github.com/Rikmorn/sidekick')).toEqual({
      owner: 'Rikmorn',
      repo: 'sidekick',
    });
    expect(parseOrigin('https://github.com/Rikmorn/sidekick.git/')).toEqual({
      owner: 'Rikmorn',
      repo: 'sidekick',
    });
  });
  test('null for other hosts or shapes', () => {
    expect(parseOrigin('git@gitlab.com:a/b.git')).toBeNull();
    expect(parseOrigin('')).toBeNull();
  });
});

describe('parseGhVersion and versionAtLeast', () => {
  test('reads the first line of gh --version', () => {
    expect(parseGhVersion('gh version 2.96.0 (2026-07-02)')).toBe('2.96.0');
    expect(parseGhVersion('bash: gh: command not found')).toBeNull();
  });
  test('compares numerically per component', () => {
    expect(versionAtLeast('2.98.0', '2.98.0')).toBe(true);
    expect(versionAtLeast('2.100.0', '2.98.0')).toBe(true);
    expect(versionAtLeast('2.96.0', '2.98.0')).toBe(false);
    expect(versionAtLeast('3.0.0', '2.98.0')).toBe(true);
  });
});

describe('hasProjectScope', () => {
  test('finds project in the X-Oauth-Scopes header, any case', () => {
    const h = 'HTTP/2.0 200 OK\nX-Oauth-Scopes: gist, project, repo\n\n{}';
    expect(hasProjectScope(h)).toBe(true);
    expect(hasProjectScope(h.toLowerCase())).toBe(true);
  });
  test('false without the scope or the header', () => {
    expect(hasProjectScope('X-Oauth-Scopes: gist, repo\n')).toBe(false);
    expect(hasProjectScope('HTTP/2.0 200 OK\n')).toBe(false);
  });
});

describe('ageDays', () => {
  test('floors whole days', () => {
    const now = new Date('2026-09-19T00:00:00Z');
    expect(ageDays('2026-09-17T23:00:00Z', now)).toBe(1);
    expect(ageDays('2026-09-10T00:00:00Z', now)).toBe(9);
  });
});

describe('touchedAt', () => {
  const at = (updatedAt: string, statusUpdatedAt: string | null) =>
    touchedAt({ updatedAt, statusUpdatedAt });
  test('the later of the issue update and the Status move', () => {
    expect(at('2026-09-01T00:00:00Z', '2026-09-10T00:00:00Z')).toBe(
      '2026-09-10T00:00:00Z',
    );
    expect(at('2026-09-10T00:00:00Z', '2026-09-01T00:00:00Z')).toBe(
      '2026-09-10T00:00:00Z',
    );
  });
  test('the issue update alone when the card has no Status time', () => {
    expect(at('2026-09-01T00:00:00Z', null)).toBe('2026-09-01T00:00:00Z');
  });
});

describe('execRunner', () => {
  test('a missing binary is code 127, not a throw', () => {
    const r = execRunner('gh', ['--version'], '/');
    // Either gh exists (code 0) or not (127); never a throw.
    expect([0, 127]).toContain(r.code);
  });
  test('git reports a failing command with its exit code', () => {
    const r = execRunner(
      'git',
      ['rev-parse', '--verify', '--quiet', 'refs/nope'],
      '/',
    );
    expect(r.code).not.toBe(0);
  });
});

describe('fixtureRunner', () => {
  test('serves the mapped body and throws on an unknown call', () => {
    const run = fixtureRunner({ 'gh --version': 'gh version 9.9.9 (x)\n' });
    expect(run('gh', ['--version'], '/').stdout).toBe('gh version 9.9.9 (x)\n');
    expect(() => run('git', ['status'], '/')).toThrow(
      'no fixture for: git status',
    );
  });
  test('sidekickMap serves both issue pages under their real keys', () => {
    const map = sidekickMap();
    const run = fixtureRunner(map);
    const base = [
      'api',
      'graphql',
      '-f',
      'query=query RepoIssues(x)',
      '-f',
      'owner=Rikmorn',
      '-f',
      'name=sidekick',
    ];
    const p1 = run('gh', base, '/');
    const cursor = (
      JSON.parse(p1.stdout) as {
        data: { repository: { issues: { pageInfo: { endCursor: string } } } };
      }
    ).data.repository.issues.pageInfo.endCursor;
    const p2 = run('gh', [...base, '-f', `after=${cursor}`], '/');
    expect(p2.stdout.length).toBeGreaterThan(100);
  });
});

describe('fetchDiscovery', () => {
  test('lists linked boards with owner login and the viewer', () => {
    const run = fixtureRunner(sidekickMap());
    const d = fetchDiscovery(run, '/', 'Rikmorn', 'sidekick');
    expect(d.viewer).toBe('Rikmorn');
    const titles = d.boards.map((b) => b.title);
    expect(titles).toContain('sidekick');
    for (const b of d.boards) {
      expect(b.ownerLogin).toBe('Rikmorn');
      expect(typeof b.closed).toBe('boolean');
      expect(b.url).toMatch(/^https:\/\/github\.com\//);
    }
  });
  test('a repo with no boards yields an empty list', () => {
    const run = fixtureRunner({
      'gh api graphql -f query=query Discovery -f owner=Rikmorn -f name=furnace':
        fixture('discovery-furnace.json'),
    });
    expect(fetchDiscovery(run, '/', 'Rikmorn', 'furnace').boards).toEqual([]);
  });
  test('a non-zero gh exit is a PmError with exit 1', () => {
    const run = fixtureRunner({
      'gh api graphql -f query=query Discovery -f owner=x -f name=y': {
        code: 1,
        stdout: '',
        stderr: 'gh: Could not resolve to a Repository',
      },
    });
    expect(() => fetchDiscovery(run, '/', 'x', 'y')).toThrow(PmError);
  });
});

describe('fetchStatusField', () => {
  test('returns the three options keyed by name', () => {
    const run = fixtureRunner(sidekickMap());
    const f = fetchStatusField(run, '/', 'Rikmorn', 2);
    expect(f.statusField).not.toBeNull();
    expect(Object.keys(f.statusField?.options ?? {}).sort()).toEqual([
      'Backlog',
      'Done',
      'In Progress',
    ]);
    expect(f.title).toBe('sidekick');
  });
  test('carries the board’s creation time', () => {
    const run = fixtureRunner(sidekickMap());
    expect(fetchStatusField(run, '/', 'Rikmorn', 2).createdAt).toBe(
      '2026-09-01T18:12:09Z',
    );
  });
});

const PROJECT_ID = 'PVT_kwHOABcx2M4BiJeE';

interface RawCard {
  id: string;
  project: { id: string };
  isArchived: boolean;
  fieldValueByName: { name?: string; updatedAt?: string } | null;
}
const rawCard = (
  id: string,
  projectId: string,
  status: { name: string; updatedAt?: string } | null,
  isArchived = false,
): RawCard => ({
  id,
  project: { id: projectId },
  isArchived,
  fieldValueByName: status,
});
const rawIssue = (
  number: number,
  cards: RawCard[],
  more = false,
  over: Record<string, unknown> = {},
) => ({
  number,
  title: `t${number}`,
  state: 'OPEN',
  stateReason: null,
  closedAt: null,
  updatedAt: '2026-10-03T12:07:12Z',
  url: `https://github.com/Rikmorn/sidekick/issues/${number}`,
  milestone: null,
  labels: { nodes: [] },
  assignees: { nodes: [] },
  projectItems: { pageInfo: { hasNextPage: more }, nodes: cards },
  ...over,
});
const rawPage = (
  nodes: unknown[],
  hasNextPage = false,
  endCursor: string | null = null,
) => ({
  repository: { issues: { pageInfo: { hasNextPage, endCursor }, nodes } },
});

describe('fetchRepoIssues', () => {
  test('walks every page of the capture, each issue once', () => {
    const run = fixtureRunner(sidekickMap());
    const issues = fetchRepoIssues(run, '/', 'Rikmorn', 'sidekick', PROJECT_ID);
    const pages = ['repo-issues-p1.json', 'repo-issues-p2.json'].map(
      (name) =>
        (
          JSON.parse(fixture(name)) as {
            data: { repository: { issues: { nodes: unknown[] } } };
          }
        ).data.repository.issues.nodes.length,
    );
    expect(pages.every((n) => n > 0)).toBe(true);
    expect(issues.length).toBe(pages[0] + pages[1]);
    const numbers = issues.map((i) => i.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const i of issues) {
      expect(['OPEN', 'CLOSED']).toContain(i.state);
      expect(i.card === null || i.card.itemId.startsWith('PVTI_')).toBe(true);
    }
  });
  test('stops at the page that says there is no next one', () => {
    const calls: string[][] = [];
    const run: Runner = (_cmd, args) => {
      calls.push(args);
      const first = !args.some((a) => a.startsWith('after='));
      const body = first
        ? rawPage([rawIssue(1, [])], true, 'CUR1')
        : rawPage([rawIssue(2, [])]);
      return {
        code: 0,
        stdout: JSON.stringify({ data: body }),
        stderr: '',
      };
    };
    const issues = fetchRepoIssues(run, '/', 'o', 'r', PROJECT_ID);
    expect(issues.map((i) => i.number)).toEqual([1, 2]);
    expect(calls.length).toBe(2);
    expect(calls[1]).toContain('after=CUR1');
  });
  test('a repository with no issues is an empty list', () => {
    const run: Runner = () => ({
      code: 0,
      stdout: JSON.stringify({ data: rawPage([]) }),
      stderr: '',
    });
    expect(fetchRepoIssues(run, '/', 'o', 'r', PROJECT_ID)).toEqual([]);
  });
});

describe('parseRepoIssuesPage', () => {
  test('a card counts only on this board, matched by project id', () => {
    const page = rawPage([
      rawIssue(1, [
        rawCard('PVTI_other', 'PVT_someone_elses_2', { name: 'Done' }),
      ]),
      rawIssue(2, [
        rawCard('PVTI_other2', 'PVT_someone_elses_2', { name: 'Done' }),
        rawCard('PVTI_mine', PROJECT_ID, { name: 'Backlog' }),
      ]),
    ]);
    const { issues } = parseRepoIssuesPage(page, PROJECT_ID);
    expect(issues[0].card).toBeNull();
    expect(issues[1].card?.itemId).toBe('PVTI_mine');
    expect(issues[1].card?.status).toBe('Backlog');
  });
  test('an issue with more boards than one page lists fails closed unless this board is on the page', () => {
    const other = rawCard('PVTI_x', 'PVT_other', { name: 'Done' });
    const mine = rawCard('PVTI_mine', PROJECT_ID, { name: 'Done' });
    expect(() =>
      parseRepoIssuesPage(rawPage([rawIssue(7, [other], true)]), PROJECT_ID),
    ).toThrow(/#7 /);
    expect(() =>
      parseRepoIssuesPage(rawPage([rawIssue(7, [other], true)]), PROJECT_ID),
    ).toThrow(PmError);
    const { issues } = parseRepoIssuesPage(
      rawPage([rawIssue(7, [other, mine], true)]),
      PROJECT_ID,
    );
    expect(issues[0].card?.itemId).toBe('PVTI_mine');
  });
  test('a card with no Status value is a card with a null status', () => {
    const { issues } = parseRepoIssuesPage(
      rawPage([rawIssue(3, [rawCard('PVTI_3', PROJECT_ID, null)])]),
      PROJECT_ID,
    );
    expect(issues[0].card).toEqual({
      itemId: 'PVTI_3',
      status: null,
      statusUpdatedAt: null,
    });
  });
  test("carries the Status value's own updatedAt, the time the card moved", () => {
    const page = rawPage([
      rawIssue(171, [
        rawCard('PVTI_171', PROJECT_ID, {
          name: 'In Progress',
          updatedAt: '2026-10-05T11:48:11Z',
        }),
      ]),
      rawIssue(172, [rawCard('PVTI_172', PROJECT_ID, { name: 'Backlog' })]),
    ]);
    const items = cardedItems(
      parseRepoIssuesPage(page, PROJECT_ID).issues,
      'Rikmorn/sidekick',
    );
    expect(
      items.map((i) => [i.number, i.updatedAt, i.statusUpdatedAt]),
    ).toEqual([
      [171, '2026-10-03T12:07:12Z', '2026-10-05T11:48:11Z'],
      [172, '2026-10-03T12:07:12Z', null],
    ]);
  });
  test('an archived card on an open issue is no card, and the issue says so', () => {
    const { issues } = parseRepoIssuesPage(
      rawPage([
        rawIssue(8, [rawCard('PVTI_8', PROJECT_ID, { name: 'Backlog' }, true)]),
        rawIssue(9, [rawCard('PVTI_9', PROJECT_ID, { name: 'Backlog' })]),
      ]),
      PROJECT_ID,
    );
    expect(issues[0].card).toBeNull();
    expect(issues[0].cardArchived).toBe(true);
    expect(issues[1].card?.itemId).toBe('PVTI_9');
    expect(issues[1].cardArchived).toBe(false);
  });
  test('an open issue with an archived card is never a pickup candidate', () => {
    const { issues } = parseRepoIssuesPage(
      rawPage([
        rawIssue(8, [rawCard('PVTI_8', PROJECT_ID, { name: 'Backlog' }, true)]),
        rawIssue(9, [rawCard('PVTI_9', PROJECT_ID, { name: 'Backlog' })]),
      ]),
      PROJECT_ID,
    );
    const items = cardedItems(issues, 'Rikmorn/sidekick');
    expect(items.map((i) => i.number)).toEqual([9]);
    expect(
      tiers(items, null, new Date('2026-10-06T00:00:00Z')).candidates.map(
        (c) => c.number,
      ),
    ).toEqual([9]);
  });
  test('an archived card on a closed issue stays a card', () => {
    const { issues } = parseRepoIssuesPage(
      rawPage([
        rawIssue(
          10,
          [rawCard('PVTI_10', PROJECT_ID, { name: 'Done' }, true)],
          false,
          { state: 'CLOSED', stateReason: 'COMPLETED' },
        ),
      ]),
      PROJECT_ID,
    );
    expect(issues[0].card?.itemId).toBe('PVTI_10');
    expect(issues[0].cardArchived).toBe(false);
  });
  test('carries closedAt, null while the issue is open', () => {
    const { issues } = parseRepoIssuesPage(
      rawPage([
        rawIssue(11, [], false, { closedAt: '2026-09-02T10:00:00Z' }),
        rawIssue(12, []),
      ]),
      PROJECT_ID,
    );
    expect(issues.map((i) => i.closedAt)).toEqual([
      '2026-09-02T10:00:00Z',
      null,
    ]);
  });
  test('a page with no nodes is an empty page', () => {
    expect(parseRepoIssuesPage(rawPage([]), PROJECT_ID)).toEqual({
      issues: [],
      hasNextPage: false,
      endCursor: null,
    });
  });
});

describe('cardedItems', () => {
  test('keeps carded issues only, with the card’s fields and the repo name', () => {
    const page = rawPage([
      rawIssue(1, []),
      rawIssue(2, [rawCard('PVTI_2', PROJECT_ID, { name: 'Done' })], false, {
        state: 'CLOSED',
        stateReason: 'COMPLETED',
      }),
    ]);
    const items = cardedItems(
      parseRepoIssuesPage(page, PROJECT_ID).issues,
      'Rikmorn/sidekick',
    );
    expect(items).toEqual([
      {
        itemId: 'PVTI_2',
        status: 'Done',
        number: 2,
        title: 't2',
        state: 'CLOSED',
        stateReason: 'COMPLETED',
        updatedAt: '2026-10-03T12:07:12Z',
        statusUpdatedAt: null,
        url: 'https://github.com/Rikmorn/sidekick/issues/2',
        milestone: null,
        labels: [],
        assignees: [],
        repo: 'Rikmorn/sidekick',
      },
    ]);
  });
});

describe('milestoneCounts', () => {
  test('counts every issue in the milestone, carded or not, open or closed', () => {
    const inR9 = { milestone: { title: 'R9' } };
    const page = rawPage([
      rawIssue(1, [], false, inR9),
      rawIssue(2, [rawCard('PVTI_2', PROJECT_ID, { name: 'Done' })], false, {
        ...inR9,
        state: 'CLOSED',
        stateReason: 'COMPLETED',
      }),
      rawIssue(3, [], false, {
        ...inR9,
        state: 'CLOSED',
        stateReason: 'NOT_PLANNED',
      }),
      rawIssue(4, [], false, { milestone: { title: 'R10' } }),
      rawIssue(5, []),
    ]);
    const issues = parseRepoIssuesPage(page, PROJECT_ID).issues;
    expect(milestoneCounts(issues, 'R9')).toEqual({ open: 1, closed: 2 });
  });
});

describe('fetchMilestones', () => {
  test('open milestones carry counts and a nullable due_on', () => {
    const run = fixtureRunner(sidekickMap());
    const ms = fetchMilestones(run, '/', 'Rikmorn', 'sidekick', 'open');
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) {
      expect(m.state).toBe('open');
      expect(typeof m.open_issues).toBe('number');
      expect(m.due_on === null || typeof m.due_on === 'string').toBe(true);
    }
  });
});

describe('fetchOpenIssues', () => {
  test('parses labels to names and milestone to its title', () => {
    const run = fixtureRunner(sidekickMap());
    const issues = fetchOpenIssues(run, '/', 'Rikmorn', 'sidekick');
    expect(issues.length).toBeGreaterThan(0);
    for (const i of issues) {
      for (const l of i.labels) expect(typeof l).toBe('string');
      expect(i.milestone === null || typeof i.milestone === 'string').toBe(
        true,
      );
      expect(typeof i.body).toBe('string');
    }
  });
  test('a result that hits the limit is an error, never a silent truncation', () => {
    const many = JSON.stringify(
      Array.from({ length: ISSUE_LIMIT }, (_, n) => ({
        number: n + 1,
        title: 't',
        labels: [],
        body: '',
        milestone: null,
        updatedAt: '2026-01-01T00:00:00Z',
      })),
    );
    expect(() => parseIssues(many)).toThrow(PmError);
  });
});

describe('gh output that does not match its schema', () => {
  test('a malformed discovery is a PmError with exit 1', () => {
    const bad = { viewer: { login: 7 }, repository: null };
    expect(() => parseDiscovery(bad)).toThrow(PmError);
    expect(() => parseDiscovery(bad)).toThrow(/discovery/);
    try {
      parseDiscovery(bad);
    } catch (e) {
      expect(e instanceof PmError && e.exit).toBe(1);
    }
  });
  test('a malformed status field is a PmError', () => {
    expect(() => parseStatusField({ user: { projectV2: null } })).toThrow(
      PmError,
    );
  });
  test('a malformed issues page is a PmError, not a crash later', () => {
    const bad = rawPage([{ number: 'seven' }]);
    expect(() => parseRepoIssuesPage(bad, PROJECT_ID)).toThrow(PmError);
    expect(() => parseRepoIssuesPage(bad, PROJECT_ID)).toThrow(/issues page/);
  });
  test('malformed milestones are a PmError', () => {
    expect(() => parseMilestones('{"message":"Not Found"}')).toThrow(PmError);
    expect(() => parseMilestones('[{"number":"one"}]')).toThrow(PmError);
  });
  test('malformed issues are a PmError', () => {
    expect(() => parseIssues('{"message":"Not Found"}')).toThrow(PmError);
    expect(() => parseIssues('[{"number":1}]')).toThrow(PmError);
  });
  test('a GraphQL envelope with errors null and valid data parses', () => {
    const withNull = JSON.stringify({
      ...JSON.parse(fixture('discovery-furnace.json')),
      errors: null,
    });
    const run = fixtureRunner({
      'gh api graphql -f query=query Discovery -f owner=Rikmorn -f name=furnace':
        withNull,
    });
    expect(fetchDiscovery(run, '/', 'Rikmorn', 'furnace').boards).toEqual([]);
  });
  test('a GraphQL envelope whose errors is not a list is a PmError', () => {
    const run = fixtureRunner({
      'gh api graphql -f query=query Discovery -f owner=x -f name=y': {
        code: 0,
        stdout: '{"errors":"not a list"}',
        stderr: '',
      },
    });
    expect(() => fetchDiscovery(run, '/', 'x', 'y')).toThrow(
      /unexpected GraphQL response/,
    );
  });
});

describe('what the schemas accept', () => {
  test('an extra key on an issue node still parses', () => {
    const page = rawPage([rawIssue(1, [], false, { somethingNew: true })]);
    expect(parseRepoIssuesPage(page, PROJECT_ID).issues).toHaveLength(1);
  });
  test('a Status value of {} or null is a card with a null status', () => {
    for (const value of [{}, null]) {
      const card = { ...rawCard('PVTI_1', PROJECT_ID, null) };
      card.fieldValueByName = value;
      const { issues } = parseRepoIssuesPage(
        rawPage([rawIssue(1, [card])]),
        PROJECT_ID,
      );
      expect(issues[0].card?.status).toBeNull();
    }
  });
  test('a close reason beyond COMPLETED and NOT_PLANNED parses', () => {
    const { issues } = parseRepoIssuesPage(
      rawPage([
        rawIssue(1, [], false, { state: 'CLOSED', stateReason: 'DUPLICATE' }),
      ]),
      PROJECT_ID,
    );
    expect(issues[0].stateReason).toBe('DUPLICATE');
  });
  test('a repository that is null has no boards', () => {
    expect(
      parseDiscovery({ viewer: { login: 'me' }, repository: null }).boards,
    ).toEqual([]);
  });
});
