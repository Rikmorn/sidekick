import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  diffSnapshots,
  isSafeRef,
  materializeRef,
  runGraphDiff,
} from './graph-diff.js';

function write(repo: string, rel: string, content: string): void {
  const full = path.join(repo, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function commit(repo: string, message: string): string {
  execSync('git add -A', { cwd: repo });
  execSync(`git commit -q -m "${message}"`, { cwd: repo });
  return execSync('git rev-parse HEAD', { cwd: repo }).toString().trim();
}

function item(id: string, status: string, extra = ''): string {
  return [
    '---',
    `id: ${id}`,
    'kind: item',
    `status: ${status}`,
    extra,
    '---',
    '',
    `# ${id} — An item`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

describe('isSafeRef', () => {
  it('refuses anything that could be read as a git option', () => {
    expect(isSafeRef('HEAD')).toBe(true);
    expect(isSafeRef('a6b6dd6~1')).toBe(true);
    expect(isSafeRef('feat/thing')).toBe(true);
    expect(isSafeRef('--upload-pack=evil')).toBe(false);
    expect(isSafeRef('-x')).toBe(false);
    expect(isSafeRef('')).toBe(false);
    expect(isSafeRef('a; rm -rf /')).toBe(false);
  });
});

describe('diffSnapshots', () => {
  const e = (id: string, status: string | null) => ({
    id,
    kind: 'item' as const,
    title: id,
    status,
    path: null,
  });
  const edge = (src: string, dst: string) => ({
    src,
    rel: 'deps' as const,
    dst,
    tier: 'EXTRACTED' as const,
    origin: 'x:1',
  });

  it('groups additions, removals, and status moves', () => {
    const delta = diffSnapshots(
      {
        entities: [e('a', 'open'), e('b', 'open')],
        edges: [edge('a', 'b')],
        runs: [],
      },
      {
        entities: [e('a', 'done'), e('c', 'open')],
        edges: [edge('a', 'c')],
        runs: [1],
      },
    );
    expect(delta.entities.added.map((x) => x.id)).toEqual(['c']);
    expect(delta.entities.removed.map((x) => x.id)).toEqual(['b']);
    expect(delta.entities.status_changed).toEqual([
      { id: 'a', from: 'open', to: 'done' },
    ]);
    expect(delta.edges.added).toEqual(['a deps c']);
    expect(delta.edges.removed).toEqual(['a deps b']);
    expect(delta.runs).toMatchObject({ from: 0, to: 1 });
  });

  it('reports nothing when the graph is unchanged', () => {
    const snap = { entities: [e('a', 'open')], edges: [], runs: [] };
    const delta = diffSnapshots(snap, snap);
    expect(delta.entities.added).toEqual([]);
    expect(delta.entities.removed).toEqual([]);
    expect(delta.entities.status_changed).toEqual([]);
    expect(delta.edges.added).toEqual([]);
  });
});

describe('runGraphDiff', () => {
  let repo: string;
  let first: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-diffrepo-'));
    execSync('git init -q -b master', { cwd: repo });
    execSync('git config user.email test@test.example', { cwd: repo });
    execSync('git config user.name Test', { cwd: repo });
    write(repo, 'docs/work/ops/1.md', item('ops-1', 'open'));
    write(repo, 'docs/work/ops/2.md', item('ops-2', 'open'));
    first = commit(repo, 'first');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('reports the item flips and new entities between two commits', () => {
    write(repo, 'docs/work/ops/1.md', item('ops-1', 'done'));
    write(repo, 'docs/work/ops/3.md', item('ops-3', 'open', 'deps: [ops-2]'));
    commit(repo, 'second');

    const res = runGraphDiff({ repoRoot: repo, fromRef: first, json: true });
    expect(res.exitCode).toBe(0);
    const delta = JSON.parse(res.stdout);
    expect(delta.entities.status_changed).toEqual([
      { id: 'ops-1', from: 'open', to: 'done' },
    ]);
    expect(delta.entities.added.map((e: { id: string }) => e.id)).toContain(
      'ops-3',
    );
    expect(delta.edges.added).toContain('ops-3 deps ops-2');
  });

  it('never touches the working tree, even with uncommitted work present', () => {
    write(repo, 'docs/work/ops/1.md', item('ops-1', 'done'));
    commit(repo, 'second');

    // Dirty the tree the way a real mid-work catch-up would be.
    write(repo, 'docs/work/ops/4.md', item('ops-4', 'active'));
    write(repo, 'scratch.txt', 'uncommitted');
    const before = execSync('git status --porcelain', { cwd: repo }).toString();

    runGraphDiff({ repoRoot: repo, fromRef: first, toRef: 'HEAD' });

    const after = execSync('git status --porcelain', { cwd: repo }).toString();
    expect(after).toBe(before);
    expect(fs.readFileSync(path.join(repo, 'scratch.txt'), 'utf-8')).toBe(
      'uncommitted',
    );
    // The dirty file is invisible to the diff: it compares committed content.
    const delta = JSON.parse(
      runGraphDiff({ repoRoot: repo, fromRef: first, json: true }).stdout,
    );
    expect(
      delta.entities.added.some((e: { id: string }) => e.id === 'ops-4'),
    ).toBe(false);
  });

  it('renders a grouped human view', () => {
    write(repo, 'docs/work/ops/1.md', item('ops-1', 'done'));
    commit(repo, 'second');
    const res = runGraphDiff({ repoRoot: repo, fromRef: first });
    expect(res.stdout).toContain('status moved:');
    expect(res.stdout).toContain('ops-1: open → done');
  });

  it('says so plainly when nothing graph-visible changed', () => {
    write(repo, 'unrelated.txt', 'noise');
    commit(repo, 'second');
    const res = runGraphDiff({ repoRoot: repo, fromRef: first });
    expect(res.stdout).toContain('no graph-visible change.');
  });

  it('refuses an unsafe ref and reports an unknown one', () => {
    const unsafe = runGraphDiff({ repoRoot: repo, fromRef: '--evil' });
    expect(unsafe.exitCode).toBe(1);
    expect(JSON.parse(unsafe.stdout).error).toBe('unsafe_ref');

    const unknown = runGraphDiff({ repoRoot: repo, fromRef: 'no-such-ref' });
    expect(unknown.exitCode).toBe(1);
    expect(JSON.parse(unknown.stdout).error).toBe('unknown_ref');
  });

  it('materializes committed content only', () => {
    write(repo, 'uncommitted.md', 'not in the tree');
    const dest = path.join(repo, '..', `mat-${path.basename(repo)}`);
    materializeRef(repo, first, dest);
    expect(fs.existsSync(path.join(dest, 'docs/work/ops/1.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'uncommitted.md'))).toBe(false);
    fs.rmSync(dest, { recursive: true, force: true });
  });
});
