/**
 * Memory files: Markdown with a front matter block of `key: value` lines and
 * one nested `metadata:` block. The CLI reads it itself, since Valibot is its
 * one runtime dependency and no YAML parser ships.
 */

import * as fs from 'node:fs';

const FENCE = '---';
const TOP_LINE = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/;
const NESTED_LINE = /^ {2}([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/;
const METADATA_KEY = 'metadata';

export interface MemoryFile {
  name: string | undefined;
  description: string | undefined;
  metadata: Readonly<Record<string, string>>;
  body: string;
}

// One pair of matching quotes comes off; only a double-quoted value unescapes.
function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length < 2) return value;
  const first = value[0];
  if (first !== value[value.length - 1]) return value;
  const inner = value.slice(1, -1);
  if (first === "'") return inner;
  if (first === '"') return inner.replace(/\\(["\\])/g, '$1');
  return value;
}

interface Scan {
  top: Record<string, string>;
  metadata: Record<string, string>;
  inMetadata: boolean;
  opened: boolean;
  afterOpener: readonly string[];
}

function scanLine(scan: Scan, line: string): Scan {
  const nested = NESTED_LINE.exec(line);
  if (nested?.[1] !== undefined) {
    if (scan.inMetadata) scan.metadata[nested[1]] = unquote(nested[2] ?? '');
    return scan;
  }
  const top = TOP_LINE.exec(line);
  const key = top?.[1];
  if (key === undefined) return scan;
  const value = top?.[2] ?? '';
  if (key === METADATA_KEY && value.trim() === '') {
    return { ...scan, inMetadata: true, opened: true };
  }
  scan.top[key] = unquote(value);
  const afterOpener = scan.opened
    ? [...scan.afterOpener, key]
    : scan.afterOpener;
  return { ...scan, inMetadata: false, afterOpener };
}

interface Scanned {
  lines: string[];
  end: number;
  scan: Scan;
}

function scanFrontMatter(text: string): Scanned | undefined {
  const lines = text.split('\n');
  const isFence = (l: string | undefined) => l?.trimEnd() === FENCE;
  if (!isFence(lines[0])) return undefined;
  const end = lines.findIndex((l, i) => i > 0 && isFence(l));
  if (end === -1) return undefined;
  const initial: Scan = {
    top: {},
    metadata: {},
    inMetadata: false,
    opened: false,
    afterOpener: [],
  };
  const scan = lines
    .slice(1, end)
    .map((l) => l.trimEnd())
    .reduce(scanLine, initial);
  return { lines, end, scan };
}

/** Parses memory text, or gives undefined when it has no closed front matter. */
export function parseMemoryText(text: string): MemoryFile | undefined {
  const scanned = scanFrontMatter(text);
  if (scanned === undefined) return undefined;
  const { lines, end, scan } = scanned;
  const rest = lines.slice(end + 1);
  const firstContent = rest.findIndex((l) => l.trim() !== '');
  return {
    name: scan.top.name,
    description: scan.top.description,
    metadata: scan.metadata,
    body: firstContent === -1 ? '' : rest.slice(firstContent).join('\n'),
  };
}

/** Reads a memory file, or gives undefined when it is unreadable or has no front matter. */
export function readMemoryFile(file: string): MemoryFile | undefined {
  try {
    return parseMemoryText(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

const TOP_LEVEL_KEYS = ['name', 'description'];

export type Flattening = { keys: string[]; blankLine: boolean };

/** The top-level keys after a front matter's `metadata:` line, other than `name` and `description`, and whether a blank line follows the opening fence. Undefined when no such key exists or the front matter does not parse. */
export function flattening(text: string): Flattening | undefined {
  const scanned = scanFrontMatter(text);
  if (scanned === undefined) return undefined;
  const keys = scanned.scan.afterOpener.filter(
    (key) => !TOP_LEVEL_KEYS.includes(key),
  );
  if (keys.length === 0) return undefined;
  return { keys, blankLine: scanned.lines[1]?.trim() === '' };
}
