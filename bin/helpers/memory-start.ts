/**
 * `sidekick hook memory-start`: gathers what the memory store knows about the
 * session's repo, matches a workstream, and renders the start-of-session text.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { readMemoryFile } from './memory-files.js';
import { type Match, matchWorkstream } from './memory-match.js';
import {
  renderStart,
  type StartParts,
  type StartSource,
} from './memory-start-render.js';
import {
  listRecords,
  listWorkstreams,
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
const STATE_HEADING = '## State';
const NEXT_HEADING = '## Next steps';
// The session id becomes part of a file name in the store.
const SESSION_ID = /^[A-Za-z0-9-]{1,128}$/;

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

/** Starts the detached snapshot commit; a no-op until the snapshot task supplies it. */
export function startSnapshot(
  _pluginDir: string,
  _store: string,
  _sessionId: string,
  _source: string,
): void {}

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

function defaultBranchOf(runGit: Runner, cwd: string): string | undefined {
  const ref = gitLine(runGit, cwd, [
    'symbolic-ref',
    '-q',
    '--short',
    'refs/remotes/origin/HEAD',
  ]);
  return ref?.replace(/^origin\//, '');
}

function briefWorkstream(env: NodeJS.ProcessEnv): string | undefined {
  const file = env.SIDEKICK_WORKER;
  if (file === undefined || file === '') return undefined;
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

// `## ` headings outside fenced code, other than the two sections the hook prints.
function otherHeadings(file: string): string[] {
  const body = readMemoryFile(file)?.body ?? '';
  const fence = { open: false };
  return body.split('\n').filter((line) => {
    if (line.trimStart().startsWith('```')) fence.open = !fence.open;
    const heading = line.trimEnd();
    return (
      !fence.open &&
      line.startsWith('## ') &&
      heading !== STATE_HEADING &&
      heading !== NEXT_HEADING
    );
  });
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
    state: deps.readSection(file, STATE_HEADING),
    nextSteps: deps.readSection(file, NEXT_HEADING),
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

// Single quotes keep a path with a space or a shell character whole when run literally.
function shellQuoted(arg: string): string {
  return `'${arg.replaceAll("'", "'\\''")}'`;
}

function missingSettingText(root: string): string {
  return `This repo is linked in the memory store, but its autoMemoryDirectory setting is missing, so Claude Code keeps memory elsewhere. Run: sidekick memory link ${shellQuoted(root)}`;
}

function gather(stdin: string, deps: StartDeps): StartResult {
  const event = parseEvent(stdin);
  if (event === undefined) return {};
  const view = repoView(event.cwd, deps);
  const base = { sessionId: event.session_id, source: event.source };
  const empty = {
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
    const warnings = [missingSettingText(view.root)];
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
    recordPath: own.path,
    recordExists: own.exists,
    match,
    ...workstreamParts(match, deps),
    records: recentRecords(match, records, own.path),
    family: familyOf(view.familyFolder),
    warnings: staleLockWarning(view.store, deps.now()),
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
