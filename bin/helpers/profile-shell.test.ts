import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type Shell, shellFunction } from './profile-shell.js';

const FIXED_ARGS = [
  '--add-dir',
  '/tmp/a folder/with space',
  '--settings',
  '{"x":"$(touch pwned)","y":"`touch pwned`","z":"it\'s"}',
  '--setting-sources',
  '',
];

let tmp: string;
let stub: string;
let record: string;
let sourceFile: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-profile-shell-'));
  stub = path.join(tmp, 'stub');
  record = path.join(tmp, 'record');
  fs.mkdirSync(path.join(tmp, 'install', 'bin'), { recursive: true });
  fs.mkdirSync(stub);
  fs.writeFileSync(
    path.join(tmp, 'install', 'bin', 'sidekick'),
    `process.stdout.write(${JSON.stringify(FIXED_ARGS.map((a) => `${a}\0`).join(''))});
process.exit(Number(process.env.FAKE_STATUS ?? 0));
`,
  );
  writeClaude([
    { id: 'sidekick@rikmorn', scope: 'project', installPath: '/wrong' },
    {
      id: 'sidekick@rikmorn',
      scope: 'user',
      installPath: path.join(tmp, 'install'),
    },
  ]);
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const writeClaude = (entries: unknown[]): void => {
  const file = path.join(stub, 'claude');
  fs.writeFileSync(
    file,
    `#!/bin/sh
if [ "$1" = plugin ] && [ "$2" = list ] && [ "$3" = --json ]; then
  printf '%s' '${JSON.stringify(entries)}'
  exit 0
fi
for a in "$@"; do printf '%s\\0' "$a" >> "$RECORD"; done
`,
    { mode: 0o755 },
  );
};

const run = (
  shell: Shell,
  args: string[],
  env: Record<string, string> = {},
  aliases: string[] = [],
  prelude = '',
) => {
  sourceFile = path.join(tmp, `skp.${shell}`);
  fs.writeFileSync(sourceFile, shellFunction(shell, aliases));
  const cmd =
    shell === 'zsh'
      ? [
          'zsh',
          '-f',
          '-c',
          `${prelude}source "$1"; shift; skp "$@"`,
          '_',
          sourceFile,
        ]
      : [
          '/bin/bash',
          '--noprofile',
          '--norc',
          '-c',
          `${prelude}source "$1"; shift; skp "$@"`,
          '_',
          sourceFile,
        ];
  return spawnSync(cmd[0] ?? '', [...cmd.slice(1), ...args], {
    cwd: tmp,
    encoding: 'utf8',
    env: {
      PATH: `${stub}:${process.env.PATH ?? ''}`,
      HOME: tmp,
      RECORD: record,
      ...env,
    },
  });
};

const recorded = (): string[] =>
  fs.readFileSync(record, 'utf8').split('\0').slice(0, -1);

describe.each(['zsh', 'bash'] as const)('skp under %s', (shell) => {
  test('passes every argument through unchanged, with the empty one kept', () => {
    const r = run(shell, ['bench', '--extra', 'a b']);
    expect(r.status).toBe(0);
    expect(recorded()).toEqual([...FIXED_ARGS, '--extra', 'a b']);
  });

  test('runs nothing the arguments contain', () => {
    run(shell, ['bench']);
    expect(fs.existsSync(path.join(tmp, 'pwned'))).toBe(false);
  });

  test('passes the arguments through when noclobber is on', () => {
    const r = run(shell, ['bench'], {}, [], 'set -C; ');
    expect(r.status).toBe(0);
    expect(recorded()).toEqual(FIXED_ARGS);
  });

  test('returns argv status and never starts claude', () => {
    const r = run(shell, ['bench'], { FAKE_STATUS: '1' });
    expect(r.status).toBe(1);
    expect(fs.existsSync(record)).toBe(false);
  });

  test('returns 1 with a message when no user-scope install exists', () => {
    writeClaude([
      { id: 'sidekick@rikmorn', scope: 'project', installPath: '/wrong' },
    ]);
    const r = run(shell, ['bench']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no user-scope sidekick@rikmorn install');
    expect(fs.existsSync(record)).toBe(false);
  });

  test('returns 2 with usage when given no profile', () => {
    const r = run(shell, []);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: skp');
  });

  test('defines one alias per name', () => {
    const r = run(shell, ['bench'], {}, ['bench', 'clean-1']);
    expect(r.status).toBe(0);
    const text = fs.readFileSync(sourceFile, 'utf8');
    expect(text).toContain("alias bench='skp bench'\n");
    expect(text).toContain("alias clean-1='skp clean-1'\n");
  });
});

describe('shellFunction', () => {
  test('throws on an invalid alias name', () => {
    expect(() => shellFunction('zsh', ["x'; rm -rf ~; '"])).toThrow(
      /invalid.*alias/i,
    );
    expect(() => shellFunction('bash', ['Bad'])).toThrow();
  });

  test('prints the function alone when no names are given', () => {
    expect(shellFunction('bash', [])).not.toContain('alias ');
  });
});
