/**
 * Data access for `sidekick pm`: one runner boundary over `gh` and `git`,
 * the GraphQL documents, and pure parsers from their output to the shapes
 * the seat reasons about. Nothing here writes to GitHub.
 */
import { spawnSync } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type Runner = (
  cmd: 'gh' | 'git',
  args: string[],
  cwd: string,
) => RunResult;

/** Never a shell: arguments go straight to the binary. */
export const execRunner: Runner = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error) return { code: 127, stdout: '', stderr: r.error.message };
  return {
    code: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
};

/** Exit code carried out of the data layer; `runPmCli` turns it into a return. */
export class PmError extends Error {
  readonly exit: 1 | 2;
  constructor(exit: 1 | 2, message: string) {
    super(message);
    this.exit = exit;
  }
}

/**
 * What a fixture runner matches on: the command and its arguments, with a
 * GraphQL document reduced to its operation name so a test can name a call
 * as `gh api graphql -f query=query Items -f login=… -F number=2`.
 */
export function runnerKey(cmd: 'gh' | 'git', args: string[]): string {
  const shown = args.map((a) =>
    a.startsWith('query=') ? a.slice(0, a.indexOf('(')) : a,
  );
  return `${cmd} ${shown.join(' ')}`;
}

const ORIGIN =
  /^(?:git@github\.com:|https:\/\/github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/;

export function parseOrigin(
  url: string,
): { owner: string; repo: string } | null {
  const m = url.trim().match(ORIGIN);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export function parseGhVersion(firstLine: string): string | null {
  const m = firstLine.match(/^gh version (\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

export function versionAtLeast(v: string, min: string): boolean {
  const a = v.split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

export function hasProjectScope(headers: string): boolean {
  const line = headers.split(/\r?\n/).find((l) => /^x-oauth-scopes:/i.test(l));
  if (!line) return false;
  return line
    .slice(line.indexOf(':') + 1)
    .split(',')
    .map((s) => s.trim())
    .includes('project');
}

export function ageDays(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/** Seven days is prescriptive: an In Progress card older than that is a question. */
export const STALE_DAYS = 7;
