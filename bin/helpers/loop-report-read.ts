/**
 * The guarded read of a unit worker's report that `sidekick loop report`
 * prints. The worker writes its worktree, and `report` runs outside its
 * fence, so it reads only a plain file inside its folder: never a link, a
 * file with another link elsewhere, or anything but a regular file. It checks
 * the path, then reads through the descriptor it checks again, so a swap
 * after the path check gains nothing.
 */

import * as fs from 'node:fs';
import { unitReportIssues } from './worker-finish-report.js';

/** One place a report may sit: the file, the folder it must lie inside, and that folder's name in a line. */
export interface Place {
  file: string;
  folder: string;
  label: string;
}

/** What a read found: the text, nothing at the place, or why it refused. */
export type Read = { text: string } | { missing: true } | { issues: string[] };

// O_NONBLOCK, so a FIFO swapped in after the check opens at once and is refused, never waited on.
const READ_NO_FOLLOW =
  fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const codeOf = (e: unknown): string | undefined =>
  e instanceof Error && 'code' in e && typeof e.code === 'string'
    ? e.code
    : undefined;

const notPlain = (file: string): string =>
  `a unit report must be a plain file inside its folder, so report prints nothing from ${file}`;

function openNoFollow(
  file: string,
): { fd: number } | Exclude<Read, { text: string }> {
  try {
    return { fd: fs.openSync(file, READ_NO_FOLLOW) };
  } catch (e) {
    const code = codeOf(e);
    if (code === 'ENOENT') return { missing: true };
    if (code === 'ELOOP') {
      return { issues: [`${file} is a symbolic link`, notPlain(file)] };
    }
    return { issues: [`cannot read ${file}: ${messageOf(e)}`] };
  }
}

// Up to `limit` bytes from `fd`, fewer at the end of the file.
function readUpTo(fd: number, limit: number): Buffer {
  const buffer = Buffer.alloc(limit);
  let filled = 0;
  let last = -1;
  while (last !== 0 && filled < limit) {
    last = fs.readSync(fd, buffer, filled, limit - filled, null);
    filled += last;
  }
  return buffer.subarray(0, filled);
}

// The opened file, judged again by its descriptor, then read up to the cap.
function readOpened(fd: number, file: string, maxBytes: number): Read {
  const stat = fs.fstatSync(fd);
  if (!stat.isFile()) {
    return { issues: [`${file} is not a regular file`, notPlain(file)] };
  }
  if (stat.nlink > 1) {
    return {
      issues: [
        `${file} has ${stat.nlink} links, so it may be a hard link to a file elsewhere`,
        notPlain(file),
      ],
    };
  }
  const tooBig = (size: string): Read => ({
    issues: [
      `${file} holds ${size} bytes, past the cap of ${maxBytes}, so report prints none of it`,
    ],
  });
  if (stat.size > maxBytes) return tooBig(String(stat.size));
  const data = readUpTo(fd, maxBytes + 1);
  if (data.length > maxBytes) return tooBig(`more than ${maxBytes}`);
  return { text: data.toString('utf8') };
}

/**
 * The report at `place`, when it is a plain file inside its folder, read
 * through the descriptor checked after the path's own check, up to
 * `maxBytes`. A report past the cap refuses, and so does one the guard
 * refuses, naming every reason.
 */
export function readPlain(place: Place, maxBytes: number): Read {
  const { file, folder, label } = place;
  const unsafe = unitReportIssues(file, folder, label);
  if (unsafe.length > 0) return { issues: [...unsafe, notPlain(file)] };
  const opened = openNoFollow(file);
  if (!('fd' in opened)) return opened;
  try {
    return readOpened(opened.fd, file, maxBytes);
  } catch (e) {
    return { issues: [`cannot read ${file}: ${messageOf(e)}`] };
  } finally {
    fs.closeSync(opened.fd);
  }
}
