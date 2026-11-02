/**
 * Matches a session to one memory workstream by five tiers, first match wins.
 */

import type { Workstream } from './memory-view.js';

export interface MatchFacts {
  ownRecordWorkstream: string | undefined;
  briefWorkstream: string | undefined;
  title: string | undefined;
  repoName: string;
  branch: string | undefined;
  defaultBranch: string | undefined;
}

export type Match =
  | {
      kind: 'matched';
      workstream: Workstream;
      label: string;
      others: Workstream[];
    }
  | { kind: 'menu'; open: Workstream[] };

interface Hit {
  workstream: Workstream;
  label: string;
}

type Tier = (all: Workstream[], facts: MatchFacts) => Hit | undefined;

function byName(a: Workstream, b: Workstream): number {
  if (a.name < b.name) return -1;
  return a.name > b.name ? 1 : 0;
}

function namedHit(
  all: Workstream[],
  name: string | undefined,
  label: string,
): Hit | undefined {
  if (name === undefined) return undefined;
  const workstream = all.find((candidate) => candidate.name === name);
  return workstream === undefined ? undefined : { workstream, label };
}

function onlyOne(found: Workstream[], label: string): Hit | undefined {
  const [workstream, second] = found;
  return workstream !== undefined && second === undefined
    ? { workstream, label }
    : undefined;
}

function startsWithName(title: string, name: string): boolean {
  const lowerTitle = title.toLowerCase();
  const lowerName = name.toLowerCase();
  if (lowerTitle === lowerName) return true;
  if (!lowerTitle.startsWith(lowerName)) return false;
  const next = lowerTitle.charAt(lowerName.length);
  return next === ':' || next === ' ';
}

const tiers: Tier[] = [
  (all, facts) =>
    namedHit(all, facts.ownRecordWorkstream, "this session's record"),
  (all, facts) => namedHit(all, facts.briefWorkstream, "the worker's brief"),
  (all, facts) => {
    const { title } = facts;
    if (title === undefined) return undefined;
    const open = all.filter((candidate) => candidate.status === 'open');
    return onlyOne(
      open.filter((candidate) => startsWithName(title, candidate.name)),
      'the title',
    );
  },
  (all, facts) => {
    const { branch } = facts;
    if (branch === undefined || branch === facts.defaultBranch)
      return undefined;
    const open = all.filter((candidate) => candidate.status === 'open');
    const onBranch = open.filter((candidate) =>
      candidate.branches.some(
        (pair) => pair.repo === facts.repoName && pair.branch === branch,
      ),
    );
    return onlyOne(onBranch, `branch ${branch}`);
  },
];

/** Returns the workstream the session belongs to and the tier that said so, or the menu of open ones. */
export function matchWorkstream(all: Workstream[], facts: MatchFacts): Match {
  const open = all
    .filter((candidate) => candidate.status === 'open')
    .sort(byName);
  for (const tier of tiers) {
    const hit = tier(all, facts);
    if (hit !== undefined) {
      const others = open.filter((candidate) => candidate !== hit.workstream);
      return {
        kind: 'matched',
        workstream: hit.workstream,
        label: hit.label,
        others,
      };
    }
  }
  return { kind: 'menu', open };
}
