// bin/helpers/fixtures/pm/runner.ts
/**
 * Test-only. Serves captured `gh` and `git` output by `runnerKey`, and
 * throws on any call it has no fixture for, so a missing fixture is a
 * failing test rather than a silent pass.
 */
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

/** The tracked-repo scenario: sidekick on board #2, on `master`, no upstream. */
export function sidekickMap(): FixtureMap {
  const p1 = fixture('items-p1.json');
  const cursor = (
    JSON.parse(p1) as {
      data: {
        user: { projectV2: { items: { pageInfo: { endCursor: string } } } };
      };
    }
  ).data.user.projectV2.items.pageInfo.endCursor;
  const items =
    'gh api graphql -f query=query Items -f login=Rikmorn -F number=2';
  return {
    'gh --version': fixture('gh-version.txt'),
    'git remote get-url origin': 'git@github.com:Rikmorn/sidekick.git\n',
    'gh config get -h github.com user': 'Rikmorn\n',
    'gh api -i user': fixture('user-headers.txt'),
    'gh api graphql -f query=query Discovery -f owner=Rikmorn -f name=sidekick':
      fixture('discovery-sidekick.json'),
    'gh api graphql -f query=query StatusField -f login=Rikmorn -F number=2':
      fixture('field-sidekick.json'),
    [items]: p1,
    [`${items} -f after=${cursor}`]: fixture('items-p2.json'),
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
