/**
 * `sidekick hook memory-start`: gathers what the memory store knows about the
 * session's repo, matches a workstream, reads the lint's cached count, and
 * renders the start-of-session text.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { localMinute } from './local-date.js';
import { linkCommand } from './memory-link-plan.js';
import {
  countById,
  MEMORY_LINT_IDS,
  type MemoryFinding,
  type MemoryLintId,
  STORE_WIDE_IDS,
} from './memory-lint.js';
import { cachePath, readCache } from './memory-lint-cache.js';
import { type Match, matchWorkstream } from './memory-match.js';
import { withheldNames } from './memory-patterns.js';
import {
  headingAs,
  NEXT_HEADING,
  otherHeadings,
  STATE_HEADING,
} from './memory-sections.js';
import {
  type LintCount,
  renderStart,
  type StartParts,
  type StartSource,
  storeFolder,
} from './memory-start-render.js';
import {
  listRecords,
  listWorkstreams,
  type RepoView,
  recordPath,
  repoView,
  type SessionRecord,
  type ViewDeps,
} from './memory-view.js';
import type { Runner } from './pm-data.js';
import { readBrief } from './worker-brief.js';

export type { StartParts, StartSource } from './memory-start-render.js';
export { renderStart } from './memory-start-render.js';

const STALE_LOCK_MS = 10 * 60 * 1000;
const RECENT_RECORDS = 3;
const INDEX_FILE = 'MEMORY.md';
// The session id becomes part of a file name in the store.
const SESSION_ID = /^[A-Za-z0-9-]{1,128}$/;
// The hook warns on these live, so the lint's count leaves them out.
const LIVE_WARNED: readonly MemoryLintId[] = ['stale-lock', 'setting-missing'];

type LinkedView = Extract<RepoView, { kind: 'linked' }>;

const EventSchema = v.object({
  session_id: v.pipe(v.string(), v.regex(SESSION_ID)),
  cwd: v.pipe(v.string(), v.minLength(1)),
  source: v.picklist(['startup', 'resume', 'clear', 'compact', 'fork']),
  // A bad title degrades to no title; it must not silence the hook.
  session_title: v.fallback(v.optional(v.string()), undefined),
});

export interface StartDeps extends ViewDeps {
  /** Reads a `## ` section, heading included; injected so this module stays clear of hook.ts. */
  readSection: (file: string, heading: string) => string | undefined;
  today: () => string;
  now: () => number;
}

export interface StartResult {
  context?: string;
  snapshot?: { store: string; sessionId: string; source: StartSource };
}

function parseEvent(
  stdin: string,
): v.InferOutput<typeof EventSchema> | undefined {
  try {
    const result = v.safeParse(EventSchema, JSON.parse(stdin));
    return result.success ? result.output : undefined;
  } catch {
    return undefined;
  }
}

function gitLine(
  runGit: Runner,
  cwd: string,
  args: string[],
): string | undefined {
  const result = runGit('git', args, cwd);
  const line = result.stdout.trim();
  return result.code === 0 && line !== '' ? line : undefined;
}

export function defaultBranchOf(
  runGit: Runner,
  cwd: string,
): string | undefined {
  const ref = gitLine(runGit, cwd, [
    'symbolic-ref',
    '-q',
    '--short',
    'refs/remotes/origin/HEAD',
  ]);
  return ref?.replace(/^origin\//, '');
}

function workerBrief(env: NodeJS.ProcessEnv): string | undefined {
  const file = env.SIDEKICK_WORKER;
  return file === undefined || file === '' ? undefined : file;
}

function briefWorkstream(env: NodeJS.ProcessEnv): string | undefined {
  const file = workerBrief(env);
  if (file === undefined) return undefined;
  const read = readBrief(file);
  return 'brief' in read ? read.brief.workstream : undefined;
}

function staleLockWarning(store: string, now: number): string[] {
  const lock = path.join(store, '.git', 'index.lock');
  try {
    if (now - fs.statSync(lock).mtimeMs <= STALE_LOCK_MS) return [];
    return [
      `The memory store has a stale git lock at ${lock}; snapshots stop until it is removed.`,
    ];
  } catch {
    return [];
  }
}

function familyOf(familyFolder: string | undefined): StartParts['family'] {
  if (familyFolder === undefined) return undefined;
  const file = path.join(familyFolder, INDEX_FILE);
  try {
    const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
    if (lines.every((line) => line.trim() === '')) return undefined;
    return { name: path.basename(familyFolder), path: file, lines };
  } catch {
    return undefined;
  }
}

function workstreamParts(
  match: Match,
  deps: StartDeps,
): Pick<StartParts, 'statePath' | 'state' | 'nextSteps' | 'otherHeadings'> {
  if (match.kind !== 'matched') {
    return {
      statePath: undefined,
      state: undefined,
      nextSteps: undefined,
      otherHeadings: [],
    };
  }
  const file = match.workstream.path;
  return {
    statePath: file,
    state: deps.readSection(file, headingAs(file, STATE_HEADING).trimEnd()),
    nextSteps: deps.readSection(file, headingAs(file, NEXT_HEADING).trimEnd()),
    otherHeadings: otherHeadings(file),
  };
}

function recentRecords(
  match: Match,
  records: SessionRecord[],
  own: string,
): SessionRecord[] {
  if (match.kind !== 'matched') return [];
  return records
    .filter(
      (record) =>
        record.path !== own && record.workstream === match.workstream.name,
    )
    .slice(0, RECENT_RECORDS);
}

// The session's folders as the lint keys its findings: store-relative, the repo's first.
function sessionFolders(view: LinkedView): string[] {
  const dirs =
    view.familyFolder === undefined
      ? [view.repoFolder]
      : [view.repoFolder, view.familyFolder];
  return dirs.map((dir) => storeFolder(view.store, dir));
}

const countsHere = (finding: MemoryFinding, folders: string[]): boolean =>
  !LIVE_WARNED.includes(finding.id) &&
  (STORE_WIDE_IDS.includes(finding.id) || folders.includes(finding.folder));

// Resume prints two lines and a worker gets no count, so neither reads the cache; any failure gives no count.
function lintCountOf(
  view: LinkedView,
  source: StartSource,
  deps: StartDeps,
): LintCount | undefined {
  if (source === 'resume' || workerBrief(deps.env) !== undefined) {
    return undefined;
  }
  try {
    const file = cachePath(view.store, deps.runGit);
    const cache = file === undefined ? undefined : readCache(file);
    if (cache === undefined) return undefined;
    const folders = sessionFolders(view);
    const here = cache.findings.filter((f) => countsHere(f, folders));
    const counts = countById(here);
    const byCheck = MEMORY_LINT_IDS.flatMap((id) => {
      const found = counts[id];
      return found === undefined ? [] : [{ id, count: found }];
    });
    return {
      count: here.length,
      byCheck,
      folders,
      ranAt: localMinute(new Date(cache.ranAt)),
    };
  } catch {
    return undefined;
  }
}

const shownName = (name: string | undefined): string | undefined =>
  name === undefined ? undefined : withheldNames(name);

// A withheld name leaves a command that names no folder; the operator finds that folder with ls.
function missingSettingText(
  view: Extract<RepoView, { kind: 'setting-missing' }>,
): string {
  const folderName = path.basename(view.folder);
  const name = folderName === path.basename(view.root) ? undefined : folderName;
  const command = linkCommand(withheldNames(view.root, path.sep), {
    family: shownName(view.family),
    name: shownName(name),
    dryRun: false,
  });
  return `This repo is linked in the memory store, but its autoMemoryDirectory setting is missing, so Claude Code keeps memory elsewhere. Run: ${command}`;
}

function gather(stdin: string, deps: StartDeps): StartResult {
  const event = parseEvent(stdin);
  if (event === undefined) return {};
  const view = repoView(event.cwd, deps);
  const base = { sessionId: event.session_id, source: event.source };
  const empty = {
    store: '',
    recordPath: '',
    recordExists: false,
    match: undefined,
    statePath: undefined,
    state: undefined,
    nextSteps: undefined,
    otherHeadings: [],
    records: [],
    family: undefined,
  };
  if (view.kind === 'none') return {};
  if (view.kind === 'setting-missing') {
    const warnings = [missingSettingText(view)];
    return { context: renderStart({ ...base, ...empty, warnings }) };
  }
  const own = recordPath(view.repoFolder, event.session_id, deps.today());
  const records = listRecords(view.repoFolder);
  const ownWorkstream = own.exists
    ? records.find((record) => record.path === own.path)?.workstream
    : undefined;
  const match = matchWorkstream(
    listWorkstreams(view.repoFolder, view.familyFolder),
    {
      ownRecordWorkstream: ownWorkstream,
      briefWorkstream: briefWorkstream(deps.env),
      title: event.session_title,
      repoName: view.repoName,
      branch: gitLine(deps.runGit, event.cwd, ['branch', '--show-current']),
      defaultBranch: defaultBranchOf(deps.runGit, event.cwd),
    },
  );
  const context = renderStart({
    ...base,
    store: view.store,
    recordPath: own.path,
    recordExists: own.exists,
    match,
    ...workstreamParts(match, deps),
    records: recentRecords(match, records, own.path),
    family: familyOf(view.familyFolder),
    warnings: staleLockWarning(view.store, deps.now()),
    lintCount: lintCountOf(view, event.source, deps),
  });
  return {
    context,
    snapshot: {
      store: view.store,
      sessionId: event.session_id,
      source: event.source,
    },
  };
}

/**
 * What the hook prints for one SessionStart event, and the snapshot it asks
 * for. Any failure gives `{}`, since a hook never fails a session.
 */
export function memoryStartContext(
  stdin: string,
  deps: StartDeps,
): StartResult {
  try {
    return gather(stdin, deps);
  } catch {
    return {};
  }
}
