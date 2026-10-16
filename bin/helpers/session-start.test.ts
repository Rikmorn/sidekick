import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRIEF_HEADER,
  PICKUP_TIMEOUT_MS,
} from '../../plugin/hooks/board/contract.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const HOOK = path.join(REPO_ROOT, 'plugin', 'hooks', 'session-start');
const HOOKS_JSON = path.join(REPO_ROOT, 'plugin', 'hooks', 'hooks.json');
const ORIENT = path.join(
  REPO_ROOT,
  'plugin',
  'skills',
  'sk-orient',
  'SKILL.md',
);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// The timeout, in seconds, of the SessionStart entry that runs this hook.
function sessionStartTimeout(config: unknown): number | undefined {
  if (!isRecord(config) || !isRecord(config.hooks)) return undefined;
  const groups = config.hooks.SessionStart;
  if (!Array.isArray(groups)) return undefined;
  const hook = groups
    .flatMap((g) => (isRecord(g) && Array.isArray(g.hooks) ? g.hooks : []))
    .find(
      (h) =>
        isRecord(h) &&
        typeof h.command === 'string' &&
        h.command.includes('hooks/session-start'),
    );
  return isRecord(hook) && typeof hook.timeout === 'number'
    ? hook.timeout
    : undefined;
}

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

  // Five bytes a period, over many 64 KiB reads, so some chunk ends
  // mid-character. A split character decodes as U+FFFD.
  test('keeps a multibyte character whole across stdin chunks', () => {
    const brief = `Milestone 9 — R9 · ${'—·'.repeat(60_000)}`;
    const r = runHook(`process.stdout.write(${JSON.stringify(brief)});`);
    expect(r.status).toBe(0);
    const context: string = JSON.parse(r.stdout).hookSpecificOutput
      .additionalContext;
    const replaced = context.split(String.fromCodePoint(0xfffd)).length - 1;
    expect(replaced).toBe(0);
    expect(context === `${BRIEF_HEADER}\n\n${brief}`).toBe(true);
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

  test("the board's pickup timeout is the hook's own, from hooks.json", () => {
    const config: unknown = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
    expect(sessionStartTimeout(config)).toBe(PICKUP_TIMEOUT_MS / 1_000);
  });
});
