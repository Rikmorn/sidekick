/**
 * A repo's local settings file, where `sidekick memory link` records the
 * `autoMemoryDirectory` key. Claude Code reads the key from the main
 * checkout's `.claude/settings.local.json`, and writes that file too, so this
 * module reads everything, changes only that key, and re-reads the file before
 * each write (ADR-0013).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { findRepo, type Repo } from './desk-children.js';
import type { Runner } from './pm-data.js';
import { shellQuote } from './shell.js';
import { physical } from './worker-repo.js';

/** The one settings key sidekick owns. */
export const SETTINGS_KEY = 'autoMemoryDirectory';

const SETTINGS_REL = path.join('.claude', 'settings.local.json');
// The same path in git's slash form, for git arguments and `.gitignore`.
const SETTINGS_GIT_PATH = '.claude/settings.local.json';

const KeySchema = v.optional(v.string());

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const defaultOwned = (target: string): boolean =>
  fs.statSync(target).uid === process.getuid?.();

/** A command, safe to paste, that files an issue on sidekick's repo asking for support. */
export const supportRequest = (title: string, body: string): string =>
  `gh issue create -R Rikmorn/sidekick --title ${shellQuote(title)} --body ${shellQuote(body)}`;

/**
 * Why Claude Code does not read the settings under `repo`'s main checkout,
 * with the way forward, or undefined when it does. `target` is the path the
 * caller asked about.
 */
export function checkoutIssue(
  target: string,
  repo: Repo,
  home: string,
  owned: (target: string) => boolean = defaultOwned,
): string | undefined {
  if (path.basename(repo.commonDir) !== '.git') {
    return `${target} is in a repo whose git dir is ${repo.commonDir}, not a folder named .git. Claude Code then does not find its main checkout, so sidekick cannot link the repo. To ask for support, run: ${supportRequest(
      'memory link: a repo whose git dir is not .git',
      'sidekick memory link refuses a repo whose git dir is not a folder named .git, such as one made with git init --separate-git-dir.',
    )}`;
  }
  const root = fs.realpathSync(repo.top);
  if (root === physical(home)) {
    return `${root} is the home folder, which Claude Code does not treat as a repo root; run the command on a path inside another repo`;
  }
  const unowned = [root, path.join(root, '.git'), path.join(root, '.claude')]
    .filter(
      (entry) => entry !== path.join(root, '.claude') || fs.existsSync(entry),
    )
    .find((entry) => !owned(entry));
  if (unowned !== undefined) {
    return `${unowned} is not owned by you, so Claude Code ignores the settings under ${root}; change the owner of ${unowned} to you, then run the command again`;
  }
  return undefined;
}

/** The main checkout's real root and every checkout of the repo, or why `path` has none and the way forward. */
export function mainCheckout(
  target: string,
  runGit: Runner,
  home: string,
  owned: (target: string) => boolean = defaultOwned,
): { root: string; checkouts: string[] } | { issue: string } {
  const found = findRepo(runGit, target);
  if (found.repo === undefined) {
    return { issue: noCheckoutIssue(target, found) };
  }
  const { repo } = found;
  const issue = checkoutIssue(target, repo, home, owned);
  if (issue !== undefined) return { issue };
  return {
    root: fs.realpathSync(repo.top),
    checkouts: repo.worktrees.map((worktree) => physical(worktree.path)),
  };
}

// How `git rev-parse` words a path outside every repository.
const NOT_A_REPO = 'not a git repository';

function isFolder(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

// Why `target` has no main checkout, quoting git when it gave a reason other
// than being outside a repository. A path that is no folder fails before git
// runs, so the runner's words are never quoted as git's.
function noCheckoutIssue(
  target: string,
  found: { listIssue?: string; revParseIssue?: string },
): string {
  const { listIssue, revParseIssue = '' } = found;
  if (listIssue !== undefined) {
    return `${target} has no main checkout, since git worktree list failed there: ${listIssue || 'it printed nothing'}; fix what git reports, then run the command again`;
  }
  const gitRefused =
    revParseIssue !== '' &&
    !revParseIssue.includes(NOT_A_REPO) &&
    isFolder(target);
  return gitRefused
    ? `${target} has no main checkout, since git rev-parse failed there: ${revParseIssue}; fix what git reports, then run the command again`
    : `${target} has no main checkout: it is not inside a git repository; run the command on a path inside one`;
}

type Parsed =
  | { ok: true; settings: Record<string, unknown>; key: string | undefined }
  | { ok: false; issue: string };

// Whitespace-only text is an empty file, which Claude Code also reads as `{}`.
function parseSettings(text: string, file: string): Parsed {
  if (text.trim() === '') return { ok: true, settings: {}, key: undefined };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      issue: `${file} is not valid JSON (${messageOf(error)}); fix it by hand and run the command again`,
    };
  }
  if (!isObject(parsed)) {
    return {
      ok: false,
      issue: `${file} is not a JSON object; fix it by hand and run the command again`,
    };
  }
  const key = v.safeParse(KeySchema, parsed[SETTINGS_KEY]);
  if (!key.success) {
    return {
      ok: false,
      issue: `${file} holds a ${SETTINGS_KEY} that is not a string; fix it by hand and run the command again`,
    };
  }
  return { ok: true, settings: parsed, key: key.output };
}

type Read = { text: string } | { issue: string };

function readText(file: string): Read {
  try {
    return { text: fs.readFileSync(file, 'utf-8') };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { text: '' };
    }
    return {
      issue: `${file} cannot be read: ${messageOf(error)}; make it a readable file and run the command again`,
    };
  }
}

/** What `settingsState` found in a repo's local settings file. */
export type SettingsState =
  | {
      kind: 'ready';
      file: string;
      /** The file's content as read; empty when the file is absent. */
      text: string;
      settings: Record<string, unknown>;
      key: string | undefined;
    }
  | { kind: 'refused'; issue: string };

// Each way forward names the main checkout `root`, where its step must run: a
// worktree's `git rm --cached` changes only that worktree's index and branch,
// and a worktree session cannot edit the main checkout's files.
function gitRefusal(root: string, runGit: Runner): string | undefined {
  const tracked = runGit(
    'git',
    ['ls-files', '--error-unmatch', '--', SETTINGS_GIT_PATH],
    root,
  );
  if (tracked.code === 0) {
    return `${SETTINGS_GIT_PATH} is tracked by git, so a key written there would reach the repo's history. In the main checkout, ${shellQuote(root)}, untrack it with: git rm --cached -- ${SETTINGS_GIT_PATH}`;
  }
  const ignored = runGit(
    'git',
    ['check-ignore', '-q', '--', SETTINGS_GIT_PATH],
    root,
  );
  if (ignored.code === 0) return undefined;
  if (ignored.code === 1) {
    return `git does not ignore ${SETTINGS_GIT_PATH}, so a key written there would show up as a change. In the main checkout, add this line to ${shellQuote(path.join(root, '.gitignore'))}: ${SETTINGS_GIT_PATH}`;
  }
  const detail = ignored.stderr.trim() || `exit code ${ignored.code}`;
  return `git check-ignore failed in ${root}: ${detail}. Fix what git reports there, then run the command again`;
}

/** The settings file at `root`, read and checked: untracked, ignored, a JSON object. */
export function settingsState(root: string, runGit: Runner): SettingsState {
  const file = path.join(root, SETTINGS_REL);
  const refusal = gitRefusal(root, runGit);
  if (refusal !== undefined) return { kind: 'refused', issue: refusal };
  const read = readText(file);
  if ('issue' in read) return { kind: 'refused', issue: read.issue };
  const parsed = parseSettings(read.text, file);
  if (!parsed.ok) return { kind: 'refused', issue: parsed.issue };
  return {
    kind: 'ready',
    file,
    text: read.text,
    settings: parsed.settings,
    key: parsed.key,
  };
}

// The text to write: every entry kept in place, the key added at the end when absent.
function mergedText(parsed: Parsed & { ok: true }, value: string): string {
  return `${JSON.stringify({ ...parsed.settings, [SETTINGS_KEY]: value }, null, 2)}\n`;
}

function ownKeyIssue(
  parsed: Parsed & { ok: true },
  value: string,
  file: string,
): string | undefined {
  if (parsed.key === undefined || parsed.key === value) return undefined;
  return `${file} now holds ${SETTINGS_KEY} ${parsed.key}, not ${value}; sidekick writes only a key that is absent or already its own`;
}

// Writes `text` to a temporary file beside `file`, with `file`'s permission bits.
function writeTemp(file: string, text: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.tmp`,
  );
  try {
    fs.writeFileSync(temp, text, { flag: 'wx' });
    if (fs.existsSync(file)) fs.chmodSync(temp, fs.statSync(file).mode & 0o777);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
  return temp;
}

type Resolved = { real: string } | { issue: string };

// A symlinked file is written through: the temporary file and the rename use
// the link's target, so the link survives. A dangling link is refused, since
// creating its target would write outside the repo on a guess.
function resolveFile(file: string): Resolved {
  try {
    return { real: fs.realpathSync(file) };
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === 'ELOOP') {
      return {
        issue: `${file} is a symlink loop: ${messageOf(error)}; remove the link, then run the command again`,
      };
    }
    if (code !== 'ENOENT') {
      return {
        issue: `${file} cannot be resolved: ${messageOf(error)}; make every folder on its path a readable folder, then run the command again`,
      };
    }
  }
  const isLink = (() => {
    try {
      return fs.lstatSync(file).isSymbolicLink();
    } catch {
      return false;
    }
  })();
  if (!isLink) return { real: file };
  return {
    issue: `${file} is a dangling symlink: its target does not exist, so sidekick does not guess where to create it; fix or remove the link and run the command again`,
  };
}

/**
 * Sets `SETTINGS_KEY` to `value` in `file`, keeping every other entry. A file
 * that no longer reads as `expected` is parsed again once; a second change
 * between that read and the rename refuses. `afterWrite` runs once the
 * temporary file exists, before the last check.
 */
export function mergeKey(
  file: string,
  value: string,
  expected: string,
  afterWrite: () => void = () => {},
): { ok: true } | { ok: false; issue: string } {
  const resolved = resolveFile(file);
  if ('issue' in resolved) return { ok: false, issue: resolved.issue };
  const { real } = resolved;
  let base = expected;
  let changes = 0;
  const changed = (): { ok: false; issue: string } => ({
    ok: false,
    issue: `${file} changed while sidekick was writing it, twice; run the command again`,
  });
  for (;;) {
    const read = readText(real);
    if ('issue' in read) return { ok: false, issue: read.issue };
    if (read.text !== base) {
      changes += 1;
      if (changes > 1) return changed();
      base = read.text;
    }
    const parsed = parseSettings(base, file);
    if (!parsed.ok) return parsed;
    const conflict = ownKeyIssue(parsed, value, file);
    if (conflict !== undefined) return { ok: false, issue: conflict };
    if (parsed.key === value) return { ok: true };
    const outcome = replaceIfUnchanged(
      real,
      mergedText(parsed, value),
      base,
      afterWrite,
    );
    if (outcome === 'written') return { ok: true };
    if (typeof outcome === 'object') return outcome;
    changes += 1;
    if (changes > 1) return changed();
    base = outcome === 'changed' ? readNow(real) : base;
  }
}

function readNow(file: string): string {
  const read = readText(file);
  return 'text' in read ? read.text : '';
}

type Replace = 'written' | 'changed' | { ok: false; issue: string };

// Writes the temp file, re-reads `file`, and renames only when it still reads as `base`.
function replaceIfUnchanged(
  file: string,
  text: string,
  base: string,
  afterWrite: () => void,
): Replace {
  let temp: string | undefined;
  try {
    temp = writeTemp(file, text);
    afterWrite();
    const again = readText(file);
    if ('issue' in again) {
      fs.rmSync(temp, { force: true });
      return { ok: false, issue: again.issue };
    }
    if (again.text !== base) {
      fs.rmSync(temp, { force: true });
      return 'changed';
    }
    fs.renameSync(temp, file);
    return 'written';
  } catch (error) {
    if (temp !== undefined) fs.rmSync(temp, { force: true });
    return {
      ok: false,
      issue: `${file} cannot be written: ${messageOf(error)}; check that ${path.dirname(file)} is writable, then run the command again`,
    };
  }
}

/**
 * The key in `target`'s main checkout settings, for profile launch. Undefined
 * on any failure: outside git, a missing file, invalid JSON, a non-string key.
 */
export function readKey(target: string, runGit: Runner): string | undefined {
  const found = findRepo(runGit, target);
  if (found.repo === undefined) return undefined;
  return readKeyAt(found.repo.top);
}

/**
 * The key in the settings file under `top`, a main checkout's root, read
 * without git. Undefined for a missing or unreadable file, invalid JSON, or a
 * non-string key.
 */
export function readKeyAt(top: string): string | undefined {
  const read = readText(path.join(top, SETTINGS_REL));
  if ('issue' in read) return undefined;
  const parsed = parseSettings(read.text, SETTINGS_REL);
  return parsed.ok ? parsed.key : undefined;
}
