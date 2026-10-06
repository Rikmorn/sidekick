/**
 * Test-only. Serves captured `gh` and `git` output by `runnerKey`, and
 * throws on any call it has no fixture for, so a missing fixture is a
 * failing test rather than a silent pass.
 */
//
// Captured against Rikmorn/sidekick with gh 2.96.0; the repo-issues pair on
// 2026-10-06. Recapture from the repo root with the commands below; run
// from a shell that can `cd` into this directory first. Q_DISC, Q_FIELD
// and Q_ISSUES are DISCOVERY_QUERY, FIELD_QUERY and ISSUES_QUERY in
// `../../pm-data.ts`, quoted as `-f query="$Q_DISC"` etc. Q_ISSUES keeps
// its production `first: 100`: the repo held 175 issues at capture, so it
// gives a real two-page fixture. If the repo ever drops to 100 issues or
// fewer, override `first` to a smaller number so the suite keeps its only
// pagination coverage.
//
//   gh api graphql -f query="$Q_DISC" -f owner=Rikmorn -f name=sidekick \
//     > discovery-sidekick.json
//   gh api graphql -f query="$Q_DISC" -f owner=Rikmorn -f name=furnace \
//     > discovery-furnace.json
//   gh api graphql -f query="$Q_FIELD" -f login=Rikmorn -F number=2 \
//     > field-sidekick.json
//   gh api graphql -f query="$Q_ISSUES" -f owner=Rikmorn -f name=sidekick \
//     > repo-issues-p1.json
//   CUR=$(python3 -c "import json; d=json.load(open('repo-issues-p1.json')); \
// print(d['data']['repository']['issues']['pageInfo']['endCursor'])")
//   gh api graphql -f query="$Q_ISSUES" -f owner=Rikmorn -f name=sidekick \
//     -f after="$CUR" > repo-issues-p2.json
//   gh api "repos/Rikmorn/sidekick/milestones?state=open&per_page=100" \
//     > milestones-open.json
//   gh api "repos/Rikmorn/sidekick/milestones?state=closed&per_page=100" \
//     > milestones-closed.json
//   gh issue list -R Rikmorn/sidekick --state open --limit 500 \
//     --json number,title,labels,body,milestone,updatedAt \
//     > issues-open.json
//   gh pr list -R Rikmorn/sidekick --head master --state open \
//     --json number,title > prs-master.json
//   gh --version | head -1 > gh-version.txt
//   gh api -i user 2>/dev/null | grep -iE '^(HTTP/|x-oauth-scopes)' \
//     > user-headers.txt
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Runner, type RunResult, runnerKey } from '../../pm-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function fixture(name: string): string {
  return fs.readFileSync(path.join(here, name), 'utf-8');
}

export type FixtureMap = Record<string, string | RunResult>;

export function fixtureRunner(map: FixtureMap): Runner {
  return (cmd, args) => {
    const key = runnerKey(cmd, args);
    const hit = map[key];
    if (hit === undefined) throw new Error(`no fixture for: ${key}`);
    return typeof hit === 'string' ? { code: 0, stdout: hit, stderr: '' } : hit;
  };
}

const ISSUES_ARGS =
  'gh issue list -R Rikmorn/sidekick --state open --limit 500 --json number,title,labels,body,milestone,updatedAt';

/**
 * The tracked-repo scenario: sidekick on board #2, on `master`, no
 * upstream.
 */
export function sidekickMap(): FixtureMap {
  const p1 = fixture('repo-issues-p1.json');
  const cursor = (
    JSON.parse(p1) as {
      data: { repository: { issues: { pageInfo: { endCursor: string } } } };
    }
  ).data.repository.issues.pageInfo.endCursor;
  const issues =
    'gh api graphql -f query=query RepoIssues -f owner=Rikmorn -f name=sidekick';
  return {
    'gh --version': fixture('gh-version.txt'),
    'git remote get-url origin': 'git@github.com:Rikmorn/sidekick.git\n',
    'gh config get -h github.com user': 'Rikmorn\n',
    'gh api -i user': fixture('user-headers.txt'),
    'gh api graphql -f query=query Discovery -f owner=Rikmorn -f name=sidekick':
      fixture('discovery-sidekick.json'),
    'gh api graphql -f query=query StatusField -f login=Rikmorn -F number=2':
      fixture('field-sidekick.json'),
    [issues]: p1,
    [`${issues} -f after=${cursor}`]: fixture('repo-issues-p2.json'),
    'gh api repos/Rikmorn/sidekick/milestones?state=open&per_page=100': fixture(
      'milestones-open.json',
    ),
    'gh api repos/Rikmorn/sidekick/milestones?state=closed&per_page=100':
      fixture('milestones-closed.json'),
    [ISSUES_ARGS]: fixture('issues-open.json'),
    'git branch --show-current': 'master\n',
    'git rev-parse --abbrev-ref @{u}': {
      code: 128,
      stdout: '',
      stderr: "fatal: no upstream configured for branch 'master'\n",
    },
    'git rev-parse --verify --quiet refs/remotes/origin/master': '43693f7\n',
    'git rev-list --count origin/master..HEAD': '0\n',
    'gh pr list --head master --state open --json number,title':
      fixture('prs-master.json'),
  };
}

/** A milestone description opened by a plans header listing `plans`. */
export const plansHeader = (...plans: string[]): string =>
  [
    '<!-- plans -->',
    ...plans.map((p, k) => `${k + 1}. ${p}`),
    '<!-- /plans -->',
    '',
    'Outcome: x.',
  ].join('\n');
