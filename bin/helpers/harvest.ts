import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * bench-5 (ADR-0008 D4) harvest capture v1 — the local half of the corpus
 * strategy's failure-harvest. An orchestrator logs a real-world failure the
 * moment it happens (`harvest log` — one command, near-zero cost, or it won't
 * happen); `harvest import` later turns an entry into a MANUAL case skeleton
 * under `evals/cases/` for operator adjudication. A skeleton never counts as
 * runner coverage until the operator builds the fixture, sets the label, and
 * drops `manual` — the label is cheapest at failure time, but it is still the
 * operator's to confirm.
 *
 * The log is repo-local scratch (gitignored): the durable artifact is the
 * adjudicated case, not the log line. Import marks the entry in place —
 * append-only discipline belongs to run records, not to a scratch inbox.
 * The hosted variant stays parked (backlog/failure-capture-pipeline.md).
 */

export const HARVEST_LOG_RELPATH = path.join('.sidekick', 'harvest.jsonl');

const SUBJECT_RE = /^(agent|skill):([a-z][a-z0-9-]*)$/;

export interface HarvestEntry {
  id: string;
  at: string;
  subject: string;
  summary: string;
  expected: string | null;
  actual: string | null;
  input: string | null;
  /** Repo-relative case.json path once imported; null while in the inbox. */
  imported_case: string | null;
}

export interface CliResult {
  stdout: string;
  exitCode: number;
}

function readEntries(repoRoot: string): HarvestEntry[] {
  const file = path.join(repoRoot, HARVEST_LOG_RELPATH);
  if (!fs.existsSync(file)) return [];
  const entries: HarvestEntry[] = [];
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      entries.push(JSON.parse(line) as HarvestEntry);
    } catch {
      // a corrupt line loses one entry, never the inbox
    }
  }
  return entries;
}

function writeEntries(repoRoot: string, entries: HarvestEntry[]): void {
  const file = path.join(repoRoot, HARVEST_LOG_RELPATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, entries.map((e) => `${JSON.stringify(e)}\n`).join(''));
}

export interface HarvestLogOptions {
  repoRoot: string;
  subject: string;
  summary: string;
  expected?: string;
  actual?: string;
  input?: string;
  /** Injected clock for tests; the CLI uses the real one. */
  now?: () => string;
}

export function runHarvestLog(opts: HarvestLogOptions): CliResult {
  if (!SUBJECT_RE.test(opts.subject)) {
    return {
      stdout: JSON.stringify({
        error: `subject must be agent:<name> or skill:<name>, got "${opts.subject}"`,
      }),
      exitCode: 1,
    };
  }
  if (opts.summary === undefined || opts.summary.trim() === '') {
    return {
      stdout: JSON.stringify({ error: 'summary must be non-empty' }),
      exitCode: 1,
    };
  }
  const entries = readEntries(opts.repoRoot);
  const entry: HarvestEntry = {
    id: `h-${entries.length + 1}`,
    at: (opts.now ?? (() => new Date().toISOString()))(),
    subject: opts.subject,
    summary: opts.summary.trim(),
    expected: opts.expected?.trim() || null,
    actual: opts.actual?.trim() || null,
    input: opts.input?.trim() || null,
    imported_case: null,
  };
  const file = path.join(opts.repoRoot, HARVEST_LOG_RELPATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
  return { stdout: JSON.stringify(entry, null, 2), exitCode: 0 };
}

export interface HarvestListOptions {
  repoRoot: string;
  json?: boolean;
}

export function runHarvestList(opts: HarvestListOptions): CliResult {
  const entries = readEntries(opts.repoRoot);
  const unimported = entries.filter((e) => e.imported_case === null).length;
  if (opts.json === true) {
    return {
      stdout: JSON.stringify({ entries, unimported }, null, 2),
      exitCode: 0,
    };
  }
  if (entries.length === 0) {
    return { stdout: 'harvest inbox empty.', exitCode: 0 };
  }
  const lines = [
    `${entries.length} harvested entr${entries.length === 1 ? 'y' : 'ies'}, ${unimported} awaiting import:`,
  ];
  for (const e of entries) {
    lines.push(
      `  ${e.id} ${e.imported_case === null ? '[inbox]' : `[imported -> ${e.imported_case}]`} ${e.subject} — ${e.summary}`,
    );
  }
  return { stdout: lines.join('\n'), exitCode: 0 };
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');

export interface HarvestImportOptions {
  repoRoot: string;
  id: string;
  suite?: string;
  caseId?: string;
}

export function runHarvestImport(opts: HarvestImportOptions): CliResult {
  const entries = readEntries(opts.repoRoot);
  const entry = entries.find((e) => e.id === opts.id);
  if (entry === undefined) {
    return {
      stdout: JSON.stringify({ error: `no harvest entry "${opts.id}"` }),
      exitCode: 1,
    };
  }
  if (entry.imported_case !== null) {
    return {
      stdout: JSON.stringify({
        error: `${opts.id} already imported -> ${entry.imported_case}`,
      }),
      exitCode: 1,
    };
  }
  const m = SUBJECT_RE.exec(entry.subject);
  if (m === null) {
    return {
      stdout: JSON.stringify({
        error: `entry ${opts.id} has malformed subject "${entry.subject}"`,
      }),
      exitCode: 1,
    };
  }
  const [, kind, name] = m;
  const suite = opts.suite ?? `harvest-${name}`;
  const caseId = opts.caseId ?? `${entry.id}-${slug(entry.summary)}`;
  const relPath = path.join('evals', 'cases', suite, caseId, 'case.json');
  const abs = path.join(opts.repoRoot, relPath);
  if (fs.existsSync(abs)) {
    return {
      stdout: JSON.stringify({ error: `case already exists at ${relPath}` }),
      exitCode: 1,
    };
  }

  const skeleton = {
    schemaVersion: 1,
    subject:
      kind === 'agent'
        ? { kind: 'agent', name }
        : { kind: 'skill', invocation: `/${name}` },
    manual: true,
    expect: [
      `HARVESTED ${entry.at} from ${entry.id}: ${entry.summary}.`,
      `Expected: ${entry.expected ?? '—'}. Actual: ${entry.actual ?? '—'}.`,
      `Input: ${entry.input ?? '—'}.`,
      'To adjudicate: build a fixture from the real input, set label.expected_verdict + assertions, then drop "manual" so the runner counts it.',
    ].join(' '),
  };
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(skeleton, null, 2)}\n`);

  entry.imported_case = relPath;
  writeEntries(opts.repoRoot, entries);
  return {
    stdout: JSON.stringify({ imported: entry.id, case_path: relPath }, null, 2),
    exitCode: 0,
  };
}
