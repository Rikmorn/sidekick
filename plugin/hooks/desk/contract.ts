// What the desk's two halves share: the snapshot `sidekick desk --json` prints
// and the mod parses, and the mod's run timeout, which the command's own
// listing stays under. This file imports nothing: `bin/` imports it under
// NodeNext, and the module loader allows relative files only.

export const DESK_VERSION = 1;

/** How long the mod lets one `sidekick desk --json` run take: under the mod's tick, so a slow run cannot stack behind the next. */
export const RUN_TIMEOUT_MS = 8_000;

export interface DeskWaiting {
  name: string;
  repo: string;
  reason: string;
  child: boolean;
}

export interface DeskChild {
  name: string;
  /** The listing's state, else its status, raw; "gone" when no row. */
  state: string;
  reason?: string;
  tokens?: number;
  plan?: string;
  lastCommit?: string;
  unintegrated: number;
  uncommitted: boolean;
}

export interface DeskOther {
  name: string;
  repo: string;
  kind: string;
  state: string;
  reason?: string;
}

export type DeskSnapshot =
  | {
      version: 1;
      ok: true;
      repo?: string;
      waiting: DeskWaiting[];
      children: DeskChild[];
      finished: number;
      others: DeskOther[];
      warnings: string[];
    }
  | { version: 1; ok: false; error: string };

type Parsed<T> = { value: T } | { issue: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function failure(error: string): DeskSnapshot {
  return { version: DESK_VERSION, ok: false, error };
}

function parseJson(text: string): Parsed<unknown> {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { issue: 'the desk command printed no JSON' };
  }
}

// A required field: its name is the issue when it is missing or mistyped.
function required<T>(
  entry: Record<string, unknown>,
  key: string,
  guard: (value: unknown) => value is T,
): Parsed<T> {
  const value = entry[key];
  return guard(value) ? { value } : { issue: key };
}

// An optional field: a mistyped one reads as absent.
function optional<T>(
  entry: Record<string, unknown>,
  key: string,
  guard: (value: unknown) => value is T,
): T | undefined {
  const value = entry[key];
  return guard(value) ? value : undefined;
}

function parseWaiting(entry: Record<string, unknown>): Parsed<DeskWaiting> {
  const name = required(entry, 'name', isString);
  if ('issue' in name) return name;
  const repo = required(entry, 'repo', isString);
  if ('issue' in repo) return repo;
  const reason = required(entry, 'reason', isString);
  if ('issue' in reason) return reason;
  const child = required(entry, 'child', isBoolean);
  if ('issue' in child) return child;
  return {
    value: {
      name: name.value,
      repo: repo.value,
      reason: reason.value,
      child: child.value,
    },
  };
}

function parseChild(entry: Record<string, unknown>): Parsed<DeskChild> {
  const name = required(entry, 'name', isString);
  if ('issue' in name) return name;
  const state = required(entry, 'state', isString);
  if ('issue' in state) return state;
  const unintegrated = required(entry, 'unintegrated', isNumber);
  if ('issue' in unintegrated) return unintegrated;
  const uncommitted = required(entry, 'uncommitted', isBoolean);
  if ('issue' in uncommitted) return uncommitted;
  const reason = optional(entry, 'reason', isString);
  const tokens = optional(entry, 'tokens', isFiniteNumber);
  const plan = optional(entry, 'plan', isString);
  const lastCommit = optional(entry, 'lastCommit', isString);
  return {
    value: {
      name: name.value,
      state: state.value,
      ...(reason === undefined ? {} : { reason }),
      ...(tokens === undefined ? {} : { tokens }),
      ...(plan === undefined ? {} : { plan }),
      ...(lastCommit === undefined ? {} : { lastCommit }),
      unintegrated: unintegrated.value,
      uncommitted: uncommitted.value,
    },
  };
}

function parseOther(entry: Record<string, unknown>): Parsed<DeskOther> {
  const name = required(entry, 'name', isString);
  if ('issue' in name) return name;
  const repo = required(entry, 'repo', isString);
  if ('issue' in repo) return repo;
  const kind = required(entry, 'kind', isString);
  if ('issue' in kind) return kind;
  const state = required(entry, 'state', isString);
  if ('issue' in state) return state;
  const reason = optional(entry, 'reason', isString);
  return {
    value: {
      name: name.value,
      repo: repo.value,
      kind: kind.value,
      state: state.value,
      ...(reason === undefined ? {} : { reason }),
    },
  };
}

// One entry's issue becomes `list[index]` or `list[index].field`.
function parseList<T>(
  snapshot: Record<string, unknown>,
  list: string,
  parseEntry: (entry: Record<string, unknown>) => Parsed<T>,
): Parsed<T[]> {
  const entries = snapshot[list];
  if (!Array.isArray(entries)) return { issue: list };
  const parsed: T[] = [];
  for (const [index, entry] of entries.entries()) {
    const where = `${list}[${index}]`;
    if (!isRecord(entry)) return { issue: where };
    const result = parseEntry(entry);
    if ('issue' in result) return { issue: `${where}.${result.issue}` };
    parsed.push(result.value);
  }
  return { value: parsed };
}

function parseWarnings(snapshot: Record<string, unknown>): Parsed<string[]> {
  const warnings: unknown = snapshot.warnings;
  if (!Array.isArray(warnings)) return { issue: 'warnings' };
  const bad = warnings.findIndex((warning) => !isString(warning));
  if (bad !== -1) return { issue: `warnings[${bad}]` };
  return { value: warnings.filter(isString) };
}

function parseOk(snapshot: Record<string, unknown>): DeskSnapshot {
  const waiting = parseList(snapshot, 'waiting', parseWaiting);
  if ('issue' in waiting) return failure(badSnapshot(waiting.issue));
  const children = parseList(snapshot, 'children', parseChild);
  if ('issue' in children) return failure(badSnapshot(children.issue));
  const others = parseList(snapshot, 'others', parseOther);
  if ('issue' in others) return failure(badSnapshot(others.issue));
  const warnings = parseWarnings(snapshot);
  if ('issue' in warnings) return failure(badSnapshot(warnings.issue));
  const finished = required(snapshot, 'finished', isNumber);
  if ('issue' in finished) return failure(badSnapshot(finished.issue));
  const repo = optional(snapshot, 'repo', isNonEmptyString);
  return {
    version: DESK_VERSION,
    ok: true,
    ...(repo === undefined ? {} : { repo }),
    waiting: waiting.value,
    children: children.value,
    finished: finished.value,
    others: others.value,
    warnings: warnings.value,
  };
}

function badSnapshot(where: string): string {
  return `the desk command printed a snapshot with a bad ${where}`;
}

/** Parses the command's stdout. Anything that is not a version-1 snapshot reads as a failure snapshot naming why. */
export function parseDeskSnapshot(text: string): DeskSnapshot {
  const json = parseJson(text);
  if ('issue' in json) return failure(json.issue);
  const value = json.value;
  if (!isRecord(value) || value.version !== DESK_VERSION) {
    return failure('the desk command printed an unknown shape');
  }
  if (value.ok === false) {
    return failure(
      isString(value.error) ? value.error : 'the desk command failed',
    );
  }
  if (value.ok !== true) {
    return failure('the desk command printed an unknown shape');
  }
  return parseOk(value);
}
