import { describe, expect, test } from 'bun:test';
import { fixture, fixtureRunner, sidekickMap } from './fixtures/pm/runner.js';
import {
  ageDays,
  execRunner,
  fetchDiscovery,
  fetchItems,
  fetchMilestones,
  fetchOpenIssues,
  fetchStatusField,
  hasProjectScope,
  ISSUE_LIMIT,
  PmError,
  parseGhVersion,
  parseIssues,
  parseOrigin,
  runnerKey,
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
  test('sidekickMap serves both item pages under their real keys', () => {
    const map = sidekickMap();
    const run = fixtureRunner(map);
    const base = [
      'api',
      'graphql',
      '-f',
      'query=query Items(x)',
      '-f',
      'login=Rikmorn',
      '-F',
      'number=2',
    ];
    const p1 = run('gh', base, '/');
    const cursor = (
      JSON.parse(p1.stdout) as {
        data: {
          user: { projectV2: { items: { pageInfo: { endCursor: string } } } };
        };
      }
    ).data.user.projectV2.items.pageInfo.endCursor;
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
  test('returns the four options keyed by name', () => {
    const run = fixtureRunner(sidekickMap());
    const f = fetchStatusField(run, '/', 'Rikmorn', 2);
    expect(f.statusField).not.toBeNull();
    expect(Object.keys(f.statusField?.options ?? {}).sort()).toEqual([
      'Backlog',
      'Done',
      'In Progress',
      'Verify',
    ]);
    expect(f.title).toBe('sidekick');
  });
});

describe('fetchItems', () => {
  test('walks every page and keeps only this repo’s issues', () => {
    const run = fixtureRunner(sidekickMap());
    const r = fetchItems(run, '/', 'Rikmorn', 2, 'Rikmorn/sidekick');
    const p1 = JSON.parse(fixture('items-p1.json')) as {
      data: { user: { projectV2: { items: { totalCount: number } } } };
    };
    expect(r.totalCount).toBe(p1.data.user.projectV2.items.totalCount);
    const seen = Object.values(r.kinds).reduce((a, b) => a + b, 0);
    expect(seen).toBe(r.totalCount);
    expect(r.items.length).toBeLessThanOrEqual(r.totalCount);
    const numbers = r.items.map((i) => i.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const i of r.items) {
      expect(['OPEN', 'CLOSED']).toContain(i.state);
      expect(i.repo).toBe('Rikmorn/sidekick');
    }
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
