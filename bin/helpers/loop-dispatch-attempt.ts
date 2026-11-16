/**
 * The attempt's folder `sidekick loop dispatch` writes once every check has
 * passed, `<loop folder>/units/<unit>/<worker>/`: the unit file, the brief,
 * and `worker.json`. A dispatch that ends while no `dispatched` line counts
 * the attempt removes what it wrote, by exact path. Once that line is
 * written, the folder stays with it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { messageOf } from './loop-io.js';
import type { UnitIssue } from './loop-issue.js';
import { renderUnitFile } from './loop-issue.js';
import {
  attemptDir,
  UNITS_DIR,
  WORKER_FILE,
  writeWorkerFile,
} from './loop-units.js';

/** The run report's path in a unit worker's worktree, relative to its top. */
export const UNIT_REPORT = 'unit-report.md';

/** The unit brief's file in the attempt's folder. */
export const BRIEF_FILE = 'brief.md';
const UNIT_FILE = 'unit.md';
/** The rulings file in the attempt's folder, which `sidekick loop answer` appends to and the brief names. */
export const RULINGS_FILE = 'rulings.md';

/** What one attempt's folder is written from. Every path is absolute. */
export interface AttemptInput {
  loopDir: string;
  /** The loop's name. */
  loop: string;
  unit: string;
  worker: string;
  issue: UnitIssue;
  /** `<plugin>:<skill>`. */
  skill: string;
  /** The commit the loop's worktree sits at, which the worker branches from. */
  baseline: string;
  /** The loop's session, which the worker messages. */
  orchestrator: string;
  /** The worker's own worktree, which it alone may write. */
  worktree: string;
  hosts: readonly string[];
  gates: readonly string[];
  dispatchedAt: Date;
}

/** What one dispatch wrote: the attempt's folder, its brief, each file, and each folder it made, outermost first. */
export interface Written {
  dir: string;
  briefPath: string;
  files: string[];
  made: string[];
}

// A code span that holds `text` whole: its fence is one backtick longer than
// the longest run inside, padded when the text starts or ends with one.
function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

const frontmatter = (a: AttemptInput, dir: string): string[] => [
  '---',
  'kind: unit',
  `name: ${a.worker}`,
  `unit: ${path.join(dir, UNIT_FILE)}`,
  `rulings: ${path.join(dir, RULINGS_FILE)}`,
  `baseline: ${a.baseline}`,
  `skill: ${a.skill}`,
  'place: worktree',
  `report: ${UNIT_REPORT}`,
  `orchestrator: ${a.orchestrator}`,
  '---',
];

const hostsLine = (hosts: readonly string[]): string =>
  hosts.length === 0
    ? '- The network reaches no host.'
    : `- The network reaches only these hosts: ${hosts.join(', ')}.`;

const limits = (a: AttemptInput, dir: string): string[] => [
  '## Limits',
  '',
  `- Write only inside this worktree, ${a.worktree}.`,
  `- Read only this worktree, the role's own skills, and the attempt's folder, ${dir}, which holds this brief, the unit file, and the rulings file.`,
  '- Make no GitHub write: no issue, comment, label, or board change.',
  '- Never push. Never amend a commit; a fix is a new commit.',
  hostsLine(a.hosts),
];

const gates = (list: readonly string[]): string[] => [
  '## Gates',
  '',
  ...(list.length === 0
    ? ['The loop names no gates.']
    : [
        "Run each gate from the worktree's top as one `Bash` call with a `timeout`, since a gate can outlast a call's default limit:",
        '',
        ...list.map((gate) => `- ${codeSpan(gate)}`),
      ]),
];

const report = (orchestrator: string): string[] => [
  '## The report',
  '',
  `Write the run report at ${codeSpan(UNIT_REPORT)} in the worktree's top, and leave it uncommitted. Commit every other change. The report holds:`,
  '',
  '- what the unit asked, and what the work did, with its commits;',
  '- each gate with its result;',
  '- a `## Proposals` section.',
  '',
  "Under `## Proposals`, list each outward action the work calls for, such as a label, a comment, or a close, as a finding for the loop's classes, with its reason. The loop acts on them, so list every one the work calls for. Write `None.` under it when the work calls for none.",
  '',
  `Then message ${codeSpan(orchestrator)} that the report is ready.`,
];

/** The unit brief's text: the frontmatter `readBrief` parses as a unit brief, then its limits, the question channel, the gates, and the report's shape. */
export function briefText(a: AttemptInput, dir: string): string {
  const rulings = path.join(dir, RULINGS_FILE);
  return [
    ...frontmatter(a, dir),
    '',
    `# Unit ${a.unit}: issue #${a.issue.number}`,
    '',
    `Loop ${codeSpan(a.loop)} dispatched this worker for one unit: issue #${a.issue.number}, under the skill ${codeSpan(a.skill)}. Read the unit file, ${path.join(dir, UNIT_FILE)}, then run that skill on it. The unit file holds the issue's text, kept only from the operator's account.`,
    '',
    ...limits(a, dir),
    '',
    '## Questions',
    '',
    `Ask the loop one question at a time: message ${codeSpan(a.orchestrator)}, then wait for its message that points at the rulings file, ${rulings}. Read that file and act on what it says, not on the message's text: the rulings file is the only source of a ruling.`,
    '',
    ...gates(a.gates),
    '',
    ...report(a.orchestrator),
    '',
  ].join('\n');
}

const isGone = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === 'ENOENT';

/**
 * Removes what `written` names: each file, then each folder it made, deepest
 * first, and only while empty. Returns a line for each removal that failed.
 */
export function removeAttempt(
  written: Pick<Written, 'files' | 'made'>,
): string[] {
  const unlinked = written.files.flatMap((file) => {
    try {
      fs.unlinkSync(file);
      return [];
    } catch (e) {
      return isGone(e) ? [] : [`cannot remove ${file}: ${messageOf(e)}`];
    }
  });
  const removed = [...written.made].reverse().flatMap((dir) => {
    try {
      fs.rmdirSync(dir);
      return [];
    } catch (e) {
      return isGone(e) ? [] : [`cannot remove ${dir}: ${messageOf(e)}`];
    }
  });
  return [...unlinked, ...removed];
}

// Writes `text` to a file that must not exist yet.
function writeNew(file: string, text: string): void {
  fs.writeFileSync(file, text, { flag: 'wx' });
}

/**
 * Writes the attempt's folder: the unit file, the brief, and `worker.json`
 * with no job yet. The folder must not exist. A failure removes what this
 * call wrote and refuses, naming why.
 */
export function writeAttempt(a: AttemptInput): Written | { issues: string[] } {
  const unitsDir = path.join(a.loopDir, UNITS_DIR);
  const dir = attemptDir(a.loopDir, a.unit, a.worker);
  const made = [unitsDir, path.dirname(dir), dir].filter(
    (folder) => !fs.existsSync(folder),
  );
  const briefPath = path.join(dir, BRIEF_FILE);
  const files = [
    path.join(dir, UNIT_FILE),
    briefPath,
    path.join(dir, WORKER_FILE),
  ];
  const written = { dir, briefPath, files, made };
  if (!made.includes(dir)) {
    return { issues: [`${dir} already exists, so dispatch wrote nothing`] };
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    writeNew(path.join(dir, UNIT_FILE), renderUnitFile(a.issue));
    writeNew(briefPath, briefText(a, dir));
    const issues = writeWorkerFile(dir, {
      v: 1,
      worker: a.worker,
      job: null,
      issue: a.issue.number,
      dispatchedAt: a.dispatchedAt.toISOString(),
    });
    if (issues.length > 0) throw new Error(issues.join('; '));
    return written;
  } catch (e) {
    return {
      issues: [
        `cannot write the attempt's folder ${dir}: ${messageOf(e)}`,
        ...removeAttempt(written),
      ],
    };
  }
}
