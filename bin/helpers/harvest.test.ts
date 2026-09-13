import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  resolveInboxPath,
  runHarvestImport,
  runHarvestList,
  runHarvestLog,
} from './harvest.js';

describe('harvest inbox path resolution', () => {
  it('uses CLAUDE_CONFIG_DIR when it is set', () => {
    expect(
      resolveInboxPath({ CLAUDE_CONFIG_DIR: '/cfg', HOME: '/home/me' }),
    ).toBe(path.join('/cfg', 'sidekick', 'harvest.jsonl'));
  });

  it('falls back to $HOME/.claude when CLAUDE_CONFIG_DIR is unset', () => {
    expect(resolveInboxPath({ HOME: '/home/me' })).toBe(
      path.join('/home/me', '.claude', 'sidekick', 'harvest.jsonl'),
    );
  });

  it('treats an empty CLAUDE_CONFIG_DIR as unset, as shell expansion does', () => {
    expect(resolveInboxPath({ CLAUDE_CONFIG_DIR: '', HOME: '/home/me' })).toBe(
      path.join('/home/me', '.claude', 'sidekick', 'harvest.jsonl'),
    );
  });
});

describe('harvest capture v1', () => {
  let repoRoot: string;
  let fakeHome: string;
  let env: Record<string, string | undefined>;
  let inbox: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-harvest-repo-'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-harvest-home-'));
    env = { HOME: fakeHome };
    inbox = path.join(fakeHome, '.claude', 'sidekick', 'harvest.jsonl');
  });
  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  const logOne = (over: Record<string, unknown> = {}) =>
    runHarvestLog({
      repoRoot,
      env,
      subject: 'agent:sk-correctness-reviewer',
      summary: 'missed an inverted condition in a retry loop',
      expected: 'status findings citing the inversion',
      actual: 'status passed',
      input: 'diff adding fetchWithRetry to src/fetcher.ts',
      now: () => '2026-08-04T12:00:00.000Z',
      ...over,
    });

  it('log appends a structured entry with a stable sequential id', () => {
    const first = logOne();
    expect(first.exitCode).toBe(0);
    const second = logOne({ summary: 'another one' });
    expect(JSON.parse(first.stdout).id).toBe('h-1');
    expect(JSON.parse(second.stdout).id).toBe('h-2');
    const lines = fs
      .readFileSync(inbox, 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines.length).toBe(2);
    expect(lines[0]).toMatchObject({
      id: 'h-1',
      subject: 'agent:sk-correctness-reviewer',
      summary: 'missed an inverted condition in a retry loop',
      expected: 'status findings citing the inversion',
      actual: 'status passed',
      at: '2026-08-04T12:00:00.000Z',
      imported_case: null,
    });
  });

  it('log writes to $CLAUDE_CONFIG_DIR/sidekick when that is set', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-harvest-cfg-'));
    try {
      logOne({ env: { CLAUDE_CONFIG_DIR: cfg, HOME: fakeHome } });
      expect(fs.existsSync(path.join(cfg, 'sidekick', 'harvest.jsonl'))).toBe(
        true,
      );
      expect(fs.existsSync(inbox)).toBe(false);
    } finally {
      fs.rmSync(cfg, { recursive: true, force: true });
    }
  });

  it('log records the git-root basename as the entry repo', () => {
    execFileSync('git', ['init', '-q'], { cwd: repoRoot });
    const entry = JSON.parse(logOne().stdout);
    expect(entry.repo).toBe(path.basename(repoRoot));
  });

  it('log records a null repo outside a git repository', () => {
    const entry = JSON.parse(logOne().stdout);
    expect(entry.repo).toBeNull();
  });

  it('the inbox is shared: entries from two repos share one id sequence', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-harvest-other-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: repoRoot });
      execFileSync('git', ['init', '-q'], { cwd: other });
      logOne();
      logOne({ repoRoot: other, summary: 'from the other repo' });
      const list = JSON.parse(runHarvestList({ env, json: true }).stdout);
      expect(list.entries.map((e: { id: string }) => e.id)).toEqual([
        'h-1',
        'h-2',
      ]);
      expect(list.entries.map((e: { repo: string }) => e.repo)).toEqual([
        path.basename(repoRoot),
        path.basename(other),
      ]);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it('log rejects a malformed subject and an empty summary', () => {
    expect(logOne({ subject: 'not-a-subject' }).exitCode).toBe(1);
    expect(logOne({ summary: '' }).exitCode).toBe(1);
  });

  it('list reports entries and the unimported count', () => {
    logOne();
    logOne({ summary: 'second' });
    const res = runHarvestList({ env, json: true });
    const parsed = JSON.parse(res.stdout);
    expect(parsed.entries.length).toBe(2);
    expect(parsed.unimported).toBe(2);
  });

  it('list --json exposes the repo each entry came from', () => {
    execFileSync('git', ['init', '-q'], { cwd: repoRoot });
    logOne();
    const parsed = JSON.parse(runHarvestList({ env, json: true }).stdout);
    expect(parsed.entries[0].repo).toBe(path.basename(repoRoot));
  });

  it('list names the repo in the human-readable listing', () => {
    execFileSync('git', ['init', '-q'], { cwd: repoRoot });
    logOne();
    expect(runHarvestList({ env }).stdout).toContain(path.basename(repoRoot));
  });

  it('list is quiet-friendly when no log exists', () => {
    const res = runHarvestList({ env, json: true });
    expect(res.exitCode).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual({ entries: [], unimported: 0 });
  });

  it('import writes a manual case skeleton and marks the entry', () => {
    logOne();
    logOne({ summary: 'still in the inbox' });
    const res = runHarvestImport({ repoRoot, env, id: 'h-1' });
    expect(res.exitCode).toBe(0);
    const out = JSON.parse(res.stdout);
    const caseJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, out.case_path), 'utf-8'),
    );
    expect(caseJson.schemaVersion).toBe(1);
    expect(caseJson.subject).toEqual({
      kind: 'agent',
      name: 'sk-correctness-reviewer',
    });
    // Manual until adjudicated: never counts as runner coverage (bench-3 gate).
    expect(caseJson.manual).toBe(true);
    expect(caseJson.expect).toContain('missed an inverted condition');
    expect(caseJson.expect).toContain('adjudicate');
    const list = JSON.parse(runHarvestList({ env, json: true }).stdout);
    expect(list.unimported).toBe(1);
    expect(list.entries[0].imported_case).toBe(out.case_path);
  });

  it('import defaults the suite to harvest-<subject-name> and refuses collisions', () => {
    logOne();
    const first = runHarvestImport({ repoRoot, env, id: 'h-1' });
    expect(JSON.parse(first.stdout).case_path).toContain(
      'evals/cases/harvest-sk-correctness-reviewer/',
    );
    const again = runHarvestImport({ repoRoot, env, id: 'h-1' });
    expect(again.exitCode).toBe(1); // already imported
  });

  it('import honours explicit suite and case-id', () => {
    logOne();
    const res = runHarvestImport({
      repoRoot,
      env,
      id: 'h-1',
      suite: 'review-correctness',
      caseId: 'harvested-inverted-retry',
    });
    expect(JSON.parse(res.stdout).case_path).toBe(
      'evals/cases/review-correctness/harvested-inverted-retry/case.json',
    );
  });

  it('import fails cleanly on an unknown id', () => {
    expect(runHarvestImport({ repoRoot, env, id: 'h-9' }).exitCode).toBe(1);
  });
});
