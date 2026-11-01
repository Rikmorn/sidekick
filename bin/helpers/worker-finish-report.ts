/**
 * The worker's run report in `finish`. It decides whether the report is
 * copied, already in place, or absent, saves it in the main checkout, and
 * checks that it did not change before the removal.
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

// An identical report already in place is not a refusal, so this check lets a
// re-run through after a failed step.
export function reportStep(
  places: Places,
  noReport: boolean,
  partial: boolean,
): ReportStep | { issues: string[] } {
  const { reportFrom: from, reportTo: to } = places;
  const worker = readIfPresent(from);
  if ('issue' in worker) return { issues: [worker.issue] };
  if (worker.data === undefined) {
    return missingReportStep(places, noReport, partial);
  }
  const saved = readIfPresent(to);
  if ('issue' in saved) return { issues: [saved.issue] };
  if (saved.data === undefined) return 'copy';
  if (saved.data.equals(worker.data)) return 'in place';
  return {
    issues: [
      `${to} already exists and differs from the worker's report at ${from}: move one aside, then run finish again`,
    ],
  };
}

// The worktree holds no report. In a partial removal, a copy in the main
// checkout counts as saved earlier, with or without --no-report.
function missingReportStep(
  places: Places,
  noReport: boolean,
  partial: boolean,
): ReportStep | { issues: string[] } {
  if (partial) {
    const saved = readIfPresent(places.reportTo);
    if ('issue' in saved) return { issues: [saved.issue] };
    if (saved.data !== undefined) return 'saved earlier';
  }
  if (noReport) return 'none';
  return {
    issues: [
      `the worktree has no run report at ${places.reportFrom}: ask the worker for it, or pass --no-report to finish without one`,
    ],
  };
}

// COPYFILE_EXCL keeps a report that appeared after the check.
function copyReport(ready: Ready, out: Out): string[] {
  try {
    fs.mkdirSync(path.dirname(ready.reportTo), { recursive: true });
    fs.copyFileSync(
      ready.reportFrom,
      ready.reportTo,
      fs.constants.COPYFILE_EXCL,
    );
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return [`cannot save the report to ${ready.reportTo}: ${why}`];
  }
  out(`report saved to ${ready.reportTo}`);
  return [];
}

export const saveReport: Step = (ready, _wenv, out) => {
  switch (ready.reportStep) {
    case 'copy':
      return copyReport(ready, out);
    case 'in place':
    case 'saved earlier':
      out(`report already at ${ready.reportTo}`);
      return [];
    case 'none':
      out('no report to save: the worktree holds none');
      return [];
    default: {
      const unhandled: never = ready.reportStep;
      throw new Error(`unhandled report step: ${unhandled}`);
    }
  }
};

// The worker's report now: still absent where the worktree held none, else
// still the copy in the main checkout.
export function reportChangedIssues(ready: Ready): string[] {
  const now = readIfPresent(ready.reportFrom);
  if ('issue' in now) return [now.issue];
  switch (ready.reportStep) {
    case 'none':
    case 'saved earlier':
      if (now.data === undefined) return [];
      return [`a run report appeared at ${ready.reportFrom}`];
    case 'copy':
    case 'in place':
      return copyChangedIssues(ready, now.data);
    default: {
      const unhandled: never = ready.reportStep;
      throw new Error(`unhandled report step: ${unhandled}`);
    }
  }
}

function copyChangedIssues(ready: Ready, now: Buffer | undefined): string[] {
  const saved = readIfPresent(ready.reportTo);
  if ('issue' in saved) return [saved.issue];
  const same =
    now !== undefined && saved.data !== undefined && now.equals(saved.data);
  if (same) return [];
  return [
    `the worker's report at ${ready.reportFrom} no longer matches the copy at ${ready.reportTo}`,
  ];
}
