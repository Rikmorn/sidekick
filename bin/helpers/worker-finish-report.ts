/**
 * The worker's run report in `finish`. It decides whether the report is
 * copied, already in place, or absent, saves it in the checkout that holds the
 * brief, and checks that it did not change before the removal. Under `--name`
 * there is no brief to say where the report is, so none is read.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BriefPlaces } from './worker-finish-tree.js';
import type { Out, Ready, Step } from './worker-teardown.js';

/**
 * What saveReport does with the report, from where, and where the saved copy
 * goes. `saved earlier` is a partial removal's copy in the brief's checkout,
 * once the worktree's has gone. `no brief` is `--name`, which reads none.
 */
export type ReportStep =
  | { kind: 'copy' | 'in place' | 'saved earlier'; from: string; to: string }
  | { kind: 'none'; from: string }
  | { kind: 'no brief' };

const isMissing = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === 'ENOENT';

// A file's bytes, undefined when it does not exist. Any other failure is an
// issue, so an unreadable report is never taken for a missing one.
function readIfPresent(
  file: string,
): { data: Buffer | undefined } | { issue: string } {
  try {
    return { data: fs.readFileSync(file) };
  } catch (e) {
    if (isMissing(e)) return { data: undefined };
    const why = e instanceof Error ? e.message : String(e);
    return { issue: `cannot read ${file}: ${why}` };
  }
}

// An identical report already in place is not a refusal, so this check lets a
// re-run through after a failed step.
export function reportStep(
  brief: BriefPlaces | undefined,
  noReport: boolean,
  partial: boolean,
): ReportStep | { issues: string[] } {
  if (brief === undefined) return { kind: 'no brief' };
  const { reportFrom: from, reportTo: to } = brief;
  const worker = readIfPresent(from);
  if ('issue' in worker) return { issues: [worker.issue] };
  if (worker.data === undefined) {
    return missingReportStep(brief, noReport, partial);
  }
  if (to === undefined) return { issues: [nowhereIssue(brief)] };
  const saved = readIfPresent(to);
  if ('issue' in saved) return { issues: [saved.issue] };
  if (saved.data === undefined) return { kind: 'copy', from, to };
  if (saved.data.equals(worker.data)) return { kind: 'in place', from, to };
  return {
    issues: [
      `${to} already exists and differs from the worker's report at ${from}: move one aside, then run finish again`,
    ],
  };
}

const nowhereIssue = (brief: BriefPlaces): string =>
  `the brief's folder ${brief.folder} is in no git checkout, so finish has nowhere to save the run report at ${brief.reportFrom}: move the brief into a checkout of the repo, then run finish again`;

// The worktree holds no report. In a partial removal, a copy in the brief's
// checkout counts as saved earlier, with or without --no-report.
function missingReportStep(
  brief: BriefPlaces,
  noReport: boolean,
  partial: boolean,
): ReportStep | { issues: string[] } {
  const { reportFrom: from, reportTo: to } = brief;
  if (partial && to !== undefined) {
    const saved = readIfPresent(to);
    if ('issue' in saved) return { issues: [saved.issue] };
    if (saved.data !== undefined) return { kind: 'saved earlier', from, to };
  }
  if (noReport) return { kind: 'none', from };
  return {
    issues: [
      `the worktree has no run report at ${from}: ask the worker for it, or pass --no-report to finish without one`,
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
      return copyReport(step.from, step.to, out);
    case 'in place':
    case 'saved earlier':
      out(`report already at ${step.to}`);
      return [];
    case 'none':
      out('no report to save: the worktree holds none');
      return [];
    case 'no brief':
      out(
        'no report saved: --name reads no brief, so finish does not know where the report is',
      );
      return [];
    default: {
      const unhandled: never = step;
      throw new Error(`unhandled report step: ${JSON.stringify(unhandled)}`);
    }
  }
};

// The worker's report now: still absent where the worktree held none, else
// still the copy in the brief's checkout. Under --name no report was read, and
// the worktree's status check sees any file that appears.
export function reportChangedIssues(ready: Ready): string[] {
  const step = ready.reportStep;
  if (step.kind === 'no brief') return [];
  const now = readIfPresent(step.from);
  if ('issue' in now) return [now.issue];
  switch (step.kind) {
    case 'none':
    case 'saved earlier':
      if (now.data === undefined) return [];
      return [`a run report appeared at ${step.from}`];
    case 'copy':
    case 'in place':
      return copyChangedIssues(step.from, step.to, now.data);
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
