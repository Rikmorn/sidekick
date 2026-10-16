import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRIEF_HEADER } from '../../plugin/hooks/board/contract.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const HOOK = path.join(REPO_ROOT, 'plugin', 'hooks', 'session-start');
const ORIENT = path.join(
  REPO_ROOT,
  'plugin',
  'skills',
  'sk-orient',
  'SKILL.md',
);
const BRIEF = 'Pickup: milestone 9\nIn progress: #211';

// Copies the hook beside a fake CLI, a node script that runs for any call.
function runHook(cliBody: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-start-'));
  try {
    fs.mkdirSync(path.join(dir, 'hooks'));
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.copyFileSync(HOOK, path.join(dir, 'hooks', 'session-start'));
    fs.writeFileSync(path.join(dir, 'bin', 'sidekick'), cliBody);
    return spawnSync('bash', [path.join(dir, 'hooks', 'session-start')], {
      input: '{"source":"startup"}',
      encoding: 'utf-8',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('plugin/hooks/session-start', () => {
  test('prints the header and the brief as one JSON object, without the skill body', () => {
    const r = runHook(`process.stdout.write(${JSON.stringify(`${BRIEF}\n`)});`);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart');
    const context: string = parsed.hookSpecificOutput.additionalContext;
    expect(context).toBe(`${BRIEF_HEADER}\n\n${BRIEF}`);
    const body = fs
      .readFileSync(ORIENT, 'utf-8')
      .split(/^---$/m)
      .slice(2)
      .join('---');
    const bodyLines = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
    expect(bodyLines.length).toBeGreaterThan(0);
    const contextLines = context.split('\n');
    expect(bodyLines.filter((l) => contextLines.includes(l))).toEqual([]);
  });

  test('prints nothing when the CLI prints nothing', () => {
    const r = runHook('');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  test('prints nothing when the CLI exits 1', () => {
    const r = runHook('process.exit(1);');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });
});
