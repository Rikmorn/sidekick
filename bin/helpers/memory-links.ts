/**
 * Markdown links as the memory lint reads them: inline links outside fenced
 * code and code spans, and the files in one folder that links reach.
 */

import * as path from 'node:path';

// An inline link or image, `[text](destination)`, on one line.
const INLINE_LINK = /\[[^\]\n]*\]\(([^)\n]*)\)/g;
const CODE_SPAN = /`[^`\n]*`/g;
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const FENCE = '```';

/** A link's file target, percent-decoded, without its `#fragment` or `"title"`, and the 1-based line it sits on. */
export interface Link {
  line: number;
  target: string;
}

// A percent-encoded path names the decoded file; a malformed sequence names itself.
function percentDecoded(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

// The path a destination names, without its `#fragment` or `"title"`; undefined for a URL or a bare anchor.
function fileTarget(destination: string): string | undefined {
  const trimmed = destination.trim();
  const close = trimmed.indexOf('>');
  const bare = trimmed.startsWith('<')
    ? trimmed.slice(1, close === -1 ? undefined : close)
    : (trimmed.split(/\s/)[0] ?? '');
  if (URL_SCHEME.test(bare)) return undefined;
  const target = bare.split('#')[0] ?? '';
  return target === '' ? undefined : percentDecoded(target);
}

/** File links outside fenced code and code spans; a line starting with ``` toggles a fence, as `otherHeadings` reads it. */
export function linksIn(text: string): Link[] {
  const fence = { open: false };
  return text.split('\n').flatMap((raw, index) => {
    if (raw.trimStart().startsWith(FENCE)) {
      fence.open = !fence.open;
      return [];
    }
    if (fence.open) return [];
    const matches = raw.replace(CODE_SPAN, '').matchAll(INLINE_LINK);
    return [...matches].flatMap((match) => {
      const target = fileTarget(match[1] ?? '');
      return target === undefined ? [] : [{ line: index + 1, target }];
    });
  });
}

// The names of the folder's own files a text links to; links leaving the folder are not followed.
function ownTargets(dir: string, text: string): string[] {
  return linksIn(text)
    .map((link) => path.resolve(dir, link.target))
    .filter((target) => path.dirname(target) === dir)
    .map((target) => path.basename(target));
}

/**
 * Every name that links reach from `starts`, at any depth, without leaving
 * `dir`; `starts` are included. `files` holds the texts the walk can read, so
 * a name missing from it ends the walk there.
 */
export function reachFrom(
  dir: string,
  files: ReadonlyArray<{ name: string; text: string }>,
  starts: readonly string[],
): Set<string> {
  const byName = new Map(files.map((own) => [own.name, own]));
  const reached = new Set<string>(starts);
  const queue = [...reached];
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    // A dead or unreadable target has no text, so the walk stops there.
    const text = byName.get(name)?.text ?? '';
    for (const target of ownTargets(dir, text)) {
      if (reached.has(target)) continue;
      reached.add(target);
      queue.push(target);
    }
  }
  return reached;
}
