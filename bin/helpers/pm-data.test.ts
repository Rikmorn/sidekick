import { describe, expect, test } from 'bun:test';
import { fixtureRunner, sidekickMap } from './fixtures/pm/runner.js';
import {
  ageDays,
  execRunner,
  hasProjectScope,
  parseGhVersion,
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
