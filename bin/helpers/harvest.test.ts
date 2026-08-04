import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  HARVEST_LOG_RELPATH,
  runHarvestImport,
  runHarvestList,
  runHarvestLog,
} from './harvest.js';

describe('harvest capture v1', () => {
  let repoRoot: string;
  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-harvest-'));
  });
  afterEach(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const logOne = (over: Record<string, string> = {}) =>
    runHarvestLog({
      repoRoot,
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
      .readFileSync(path.join(repoRoot, HARVEST_LOG_RELPATH), 'utf-8')
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

  it('log rejects a malformed subject and an empty summary', () => {
    expect(logOne({ subject: 'not-a-subject' }).exitCode).toBe(1);
    expect(logOne({ summary: '' }).exitCode).toBe(1);
  });

  it('list reports entries and the unimported count', () => {
    logOne();
    logOne({ summary: 'second' });
    const res = runHarvestList({ repoRoot, json: true });
    const parsed = JSON.parse(res.stdout);
    expect(parsed.entries.length).toBe(2);
    expect(parsed.unimported).toBe(2);
  });

  it('list is quiet-friendly when no log exists', () => {
    const res = runHarvestList({ repoRoot, json: true });
    expect(res.exitCode).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual({ entries: [], unimported: 0 });
  });

  it('import writes a manual case skeleton and marks the entry', () => {
    logOne();
    logOne({ summary: 'still in the inbox' });
    const res = runHarvestImport({ repoRoot, id: 'h-1' });
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
    const list = JSON.parse(runHarvestList({ repoRoot, json: true }).stdout);
    expect(list.unimported).toBe(1);
    expect(list.entries[0].imported_case).toBe(out.case_path);
  });

  it('import defaults the suite to harvest-<subject-name> and refuses collisions', () => {
    logOne();
    const first = runHarvestImport({ repoRoot, id: 'h-1' });
    expect(JSON.parse(first.stdout).case_path).toContain(
      'evals/cases/harvest-sk-correctness-reviewer/',
    );
    const again = runHarvestImport({ repoRoot, id: 'h-1' });
    expect(again.exitCode).toBe(1); // already imported
  });

  it('import honours explicit suite and case-id', () => {
    logOne();
    const res = runHarvestImport({
      repoRoot,
      id: 'h-1',
      suite: 'review-correctness',
      caseId: 'harvested-inverted-retry',
    });
    expect(JSON.parse(res.stdout).case_path).toBe(
      'evals/cases/review-correctness/harvested-inverted-retry/case.json',
    );
  });

  it('import fails cleanly on an unknown id', () => {
    expect(runHarvestImport({ repoRoot, id: 'h-9' }).exitCode).toBe(1);
  });
});
