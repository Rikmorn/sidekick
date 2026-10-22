import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseSessionAnswer,
  RUN_TIMEOUT_MS,
} from '../../plugin/hooks/name/contract.js';
import { removeTemps, tmp } from './fixtures/worker/repo.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import {
  runSessionCli,
  SESSION_USAGE_LINE,
  type SessionEnv,
} from './session.js';

afterEach(removeTemps);

const SID = '12ab8963-1111-2222-3333-444444444444';
const ok = (over: Partial<ClaudeResult> = {}): ClaudeResult => ({
  code: 0,
  stdout: '[]',
  stderr: '',
  timedOut: false,
  ...over,
});

function run(argv: string[], result: ClaudeResult, nameSource?: string) {
  const configDir = tmp();
  if (nameSource !== undefined) {
    fs.mkdirSync(path.join(configDir, 'sessions'));
    fs.writeFileSync(
      path.join(configDir, 'sessions', '1.json'),
      JSON.stringify({ sessionId: SID, nameSource }),
    );
  }
  const runClaude: ClaudeRunner = () => result;
  const senv: SessionEnv = { cwd: configDir, configDir, runClaude };
  const out: string[] = [];
  const err: string[] = [];
  const code = runSessionCli(
    argv,
    senv,
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
}

const listing = (rows: object[]): ClaudeResult =>
  ok({ stdout: JSON.stringify(rows) });

describe('runSessionCli', () => {
  test('prints the name and whether it holds', () => {
    const r = run(
      ['--json', '--self', SID],
      listing([{ sessionId: SID, name: 'p11', kind: 'bg' }]),
      'user',
    );
    expect(r.code).toBe(0);
    expect(r.out).toEqual(['{"version":1,"name":"p11","held":true}']);
    expect(parseSessionAnswer(r.out[0] ?? '')).toBeDefined();
  });
  test('a session not in the listing has a null name and null held', () => {
    const r = run(['--json', '--self', SID], listing([]));
    expect(r.out).toEqual(['{"version":1,"name":null,"held":null}']);
  });
  test('an automatic name is not held', () => {
    const r = run(
      ['--json', '--self', SID],
      listing([{ sessionId: SID, name: 'Single word reply' }]),
      'derived',
    );
    expect(r.out).toEqual([
      '{"version":1,"name":"Single word reply","held":false}',
    ]);
  });
  test.each([
    [[]],
    [['--json']],
    [['--self', SID]],
    [['--json', '--self']],
  ])('usage error %p prints usage and returns 1', (argv) => {
    const r = run(argv, listing([]));
    expect(r.code).toBe(1);
    expect(r.err).toEqual([`usage: ${SESSION_USAGE_LINE}`]);
    expect(r.out).toEqual([]);
  });
  test('a failed listing returns 1 with the issue on stderr', () => {
    const r = run(['--json', '--self', SID], ok({ code: 2, stderr: 'boom' }));
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('failed with exit code 2');
    expect(r.out).toEqual([]);
  });
  test('a listing that does not parse returns 1', () => {
    const r = run(['--json', '--self', SID], ok({ stdout: 'nope' }));
    expect(r.code).toBe(1);
    expect(r.err[0]).toContain('not JSON');
  });
  test('the listing times out before the mod kills the run, and the timeout is a parameter', () => {
    const seen: (number | undefined)[] = [];
    const configDir = tmp();
    const runClaude: ClaudeRunner = (_args, opts) => {
      seen.push(opts.timeoutMs);
      return ok();
    };
    const senv: SessionEnv = { cwd: configDir, configDir, runClaude };
    const argv = ['--json', '--self', SID];
    runSessionCli(
      argv,
      senv,
      () => {},
      () => {},
    );
    runSessionCli(
      argv,
      senv,
      () => {},
      () => {},
      1_234,
    );
    expect(seen[0]).toBeLessThan(RUN_TIMEOUT_MS);
    expect(seen[1]).toBe(1_234);
  });
});
