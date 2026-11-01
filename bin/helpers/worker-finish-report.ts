/**
 * The worker's run report in `finish`. It decides whether the report is
 * copied, already in place, or absent, saves it in the checkout that holds the
 * brief, and checks that it did not change before the removal.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Places } from './worker-finish-tree.js';
import {
  type Out,
  type Ready,
  type ReportStep,
  readIfPresent,
  type Step,
} from './worker-teardown.js';

type ReportPlaces = Pick<Places, 'reportFrom' | 'reportTo' | 'briefFolder'>;

// An identical report already in place is not a refusal, so this check lets a
// re-run through after a failed step.
export function reportStep(
  places: ReportPlaces,
  noReport: boolean,
  partial: boolean,
): ReportStep | { issues: string[] } {
  const { reportFrom: from, reportTo: to } = places;
  const worker = readIfPresent(from);
  if ('issue' in worker) return { issues: [worker.issue] };
  if (worker.data === undefined) {
    return missingReportStep(places, noReport, partial);
  }
  if (to === undefined) return { issues: [nowhereIssue(places)] };
  const saved = readIfPresent(to);
  if ('issue' in saved) return { issues: [saved.issue] };
  if (saved.data === undefined) return { kind: 'copy', to };
  if (saved.data.equals(worker.data)) return { kind: 'in place', to };
  return {
    issues: [
      `${to} already exists and differs from the worker's report at ${from}: move one aside, then run finish again`,
    ],
  };
}

const nowhereIssue = (places: ReportPlaces): string =>
  `the brief's folder ${places.briefFolder} is in no git checkout, so finish has nowhere to save the run report at ${places.reportFrom}: move the brief into a checkout of the repo, then run finish again`;

// The worktree holds no report. In a partial removal, a copy in the brief's
// checkout counts as saved earlier, with or without --no-report.
function missingReportStep(
  places: ReportPlaces,
  noReport: boolean,
  partial: boolean,
): ReportStep | { issues: string[] } {
  const { reportTo: to } = places;
  if (partial && to !== undefined) {
    const saved = readIfPresent(to);
    if ('issue' in saved) return { issues: [saved.issue] };
    if (saved.data !== undefined) return { kind: 'saved earlier', to };
  }
  if (noReport) return { kind: 'none' };
  return {
    issues: [
      `the worktree has no run report at ${places.reportFrom}: ask the worker for it, or pass --no-report to finish without one`,
    ],
  };
}

// COPYFILE_EXCL keeps a report that appeared after the check.
function copyReport(from: string, to: string, out: Out): string[] {
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return [`cannot save the report to ${to}: ${why}`];
  }
  out(`report saved to ${to}`);
  return [];
}

export const saveReport: Step = (ready, _wenv, out) => {
  const step = ready.reportStep;
  switch (step.kind) {
    case 'copy':
      return copyReport(ready.reportFrom, step.to, out);
    case 'in place':
    case 'saved earlier':
      out(`report already at ${step.to}`);
      return [];
    case 'none':
      out('no report to save: the worktree holds none');
      return [];
    default: {
      const unhandled: never = step;
      throw new Error(`unhandled report step: ${JSON.stringify(unhandled)}`);
    }
  }
};

// The worker's report now: still absent where the worktree held none, else
// still the copy in the brief's checkout.
export function reportChangedIssues(ready: Ready): string[] {
  const now = readIfPresent(ready.reportFrom);
  if ('issue' in now) return [now.issue];
  const step = ready.reportStep;
  switch (step.kind) {
    case 'none':
    case 'saved earlier':
      if (now.data === undefined) return [];
      return [`a run report appeared at ${ready.reportFrom}`];
    case 'copy':
    case 'in place':
      return copyChangedIssues(ready.reportFrom, step.to, now.data);
    default: {
      const unhandled: never = step;
      throw new Error(`unhandled report step: ${JSON.stringify(unhandled)}`);
    }
  }
}

function copyChangedIssues(
  from: string,
  to: string,
  now: Buffer | undefined,
): string[] {
  const saved = readIfPresent(to);
  if ('issue' in saved) return [saved.issue];
  const same =
    now !== undefined && saved.data !== undefined && now.equals(saved.data);
  if (same) return [];
  return [`the worker's report at ${from} no longer matches the copy at ${to}`];
}
