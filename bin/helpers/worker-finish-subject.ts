/**
 * Who `finish` clears: the worker's name, its brief when it has one, and the
 * checkout that launched it, which its worktree cannot be. That checkout is
 * the brief's; under `--name`, the one holding the brief folder the dispatch
 * record names, else the linked checkout finish runs in.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';
import { readBrief } from './worker-brief.js';
import type { FinishSubject } from './worker-finish-args.js';
import type { BriefRead } from './worker-finish-tree.js';
import { readRecords } from './worker-record.js';
import { type CheckoutFacts, checkoutOf, physical } from './worker-repo.js';
import type { Launcher } from './worker-worktree.js';

/** The worker's name, where it came from, and its brief as read, which is undefined under `--name`. */
export interface Subject {
  name: string;
  from: FinishSubject['kind'];
  read: BriefRead | undefined;
}

// The top of the checkout holding `folder`, undefined when it is in none.
function topOf(runGit: Runner, folder: string): string | undefined {
  const found = checkoutOf(runGit, folder);
  return 'top' in found ? found.top : undefined;
}

/** The worker's name, and under a brief, the brief with the folder and checkout that hold it. */
export function readSubject(
  subject: FinishSubject,
  runGit: Runner,
): Subject | { issues: string[] } {
  switch (subject.kind) {
    case 'brief': {
      const read = readBrief(subject.brief);
      if ('issues' in read) return read;
      const folder = path.dirname(subject.brief);
      const top = topOf(runGit, folder);
      const { brief } = read;
      return { name: brief.name, from: 'brief', read: { brief, folder, top } };
    }
    case 'name':
      return { name: subject.name, from: 'name', read: undefined };
    default: {
      const unhandled: never = subject;
      throw new Error(`unhandled subject: ${JSON.stringify(unhandled)}`);
    }
  }
}

// The checkout holding the brief folder that the worker's dispatch record
// names, when the record and the folder both exist.
function recordedTop(
  runGit: Runner,
  commonDir: string,
  name: string,
): string | undefined {
  const { records } = readRecords(commonDir);
  const record = records.find((r) => r.name === name);
  if (record === undefined) return undefined;
  const folder = path.dirname(record.brief);
  return fs.existsSync(folder) ? topOf(runGit, folder) : undefined;
}

/**
 * The checkout the worker's worktree cannot be, besides the main checkout:
 * the brief's; under `--name`, the one its dispatch record names, else the
 * checkout finish runs in when that is a linked worktree.
 */
export function launcherOf(
  subject: Subject,
  facts: Pick<CheckoutFacts, 'commonDir' | 'launchTop' | 'mainTop'>,
  runGit: Runner,
): Launcher | undefined {
  const { read } = subject;
  if (read !== undefined) {
    const { top } = read;
    return top === undefined
      ? undefined
      : { top, role: "the brief's checkout" };
  }
  const recorded = recordedTop(runGit, facts.commonDir, subject.name);
  if (recorded !== undefined) {
    return { top: recorded, role: 'the checkout that dispatched the worker' };
  }
  const linked = physical(facts.launchTop) !== physical(facts.mainTop);
  if (!linked) return undefined;
  return { top: facts.launchTop, role: 'the checkout finish runs in' };
}
