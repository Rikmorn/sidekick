/**
 * ops-3 — `sidekick graph diff <ref> [ref]`: what changed between two commits.
 *
 * This is the catch-up mechanism. After weeks away the question is not "what do
 * the files say" but "what moved" — which items flipped status, which decisions
 * landed, what got wired to what.
 *
 * Both sides are materialized from committed content into temp directories. The
 * working tree is never touched, never stashed, never checked out: running
 * catch-up must be safe with uncommitted work in progress, or it will not get
 * run when it is most needed.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { collectGraph } from './graph-build.js';
import type { Edge, Entity } from './graph-model.js';

export interface CliResult {
  stdout: string;
  exitCode: number;
}

/**
 * Refs reach a git argv, so they are fenced first: anything that could be read
 * as an option, and anything outside the ref character set, is refused rather
 * than passed through.
 */
export function isSafeRef(ref: string): boolean {
  if (ref === '' || ref.startsWith('-')) return false;
  return /^[A-Za-z0-9._/~^{}@-]+$/.test(ref);
}

function git(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/**
 * Write the tree at `ref` into a fresh directory. `git archive` reads committed
 * objects only — no checkout, no index write, no working-tree mutation.
 */
export function materializeRef(
  repoRoot: string,
  ref: string,
  destDir: string,
): void {
  fs.mkdirSync(destDir, { recursive: true });
  const tarPath = path.join(destDir, '.tree.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tarPath, ref], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  execFileSync('tar', ['-xf', tarPath, '-C', destDir], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  fs.rmSync(tarPath, { force: true });
}

export interface GraphDelta {
  from: { ref: string; commit: string };
  to: { ref: string; commit: string };
  entities: {
    added: Array<{ id: string; kind: string; title: string }>;
    removed: Array<{ id: string; kind: string; title: string }>;
    status_changed: Array<{
      id: string;
      from: string | null;
      to: string | null;
    }>;
  };
  edges: { added: string[]; removed: string[] };
  runs: { from: number; to: number; by_suite: Record<string, number> };
}

const edgeKey = (e: Edge): string => `${e.src} ${e.rel} ${e.dst}`;

export function diffSnapshots(
  before: { entities: Entity[]; edges: Edge[]; runs: unknown[] },
  after: { entities: Entity[]; edges: Edge[]; runs: unknown[] },
): Omit<GraphDelta, 'from' | 'to'> {
  const beforeById = new Map(before.entities.map((e) => [e.id, e]));
  const afterById = new Map(after.entities.map((e) => [e.id, e]));

  const added = after.entities
    .filter((e) => !beforeById.has(e.id))
    .map((e) => ({ id: e.id, kind: e.kind, title: e.title }));
  const removed = before.entities
    .filter((e) => !afterById.has(e.id))
    .map((e) => ({ id: e.id, kind: e.kind, title: e.title }));

  const statusChanged: GraphDelta['entities']['status_changed'] = [];
  for (const [id, afterEntity] of afterById) {
    const beforeEntity = beforeById.get(id);
    if (beforeEntity === undefined) continue;
    if (beforeEntity.status !== afterEntity.status) {
      statusChanged.push({
        id,
        from: beforeEntity.status,
        to: afterEntity.status,
      });
    }
  }

  const beforeEdges = new Set(before.edges.map(edgeKey));
  const afterEdges = new Set(after.edges.map(edgeKey));

  return {
    entities: {
      added: added.sort(byId),
      removed: removed.sort(byId),
      status_changed: statusChanged.sort(byId),
    },
    edges: {
      added: [...afterEdges].filter((k) => !beforeEdges.has(k)).sort(),
      removed: [...beforeEdges].filter((k) => !afterEdges.has(k)).sort(),
    },
    runs: { from: before.runs.length, to: after.runs.length, by_suite: {} },
  };
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface DiffOptions {
  repoRoot: string;
  fromRef: string;
  toRef?: string;
  json?: boolean;
}

export function runGraphDiff(opts: DiffOptions): CliResult {
  const toRef = opts.toRef ?? 'HEAD';
  for (const ref of [opts.fromRef, toRef]) {
    if (!isSafeRef(ref)) {
      return {
        stdout: JSON.stringify({
          error: 'unsafe_ref',
          message: `"${ref}" is not a usable git ref.`,
        }),
        exitCode: 1,
      };
    }
  }

  let fromCommit: string;
  let toCommit: string;
  try {
    fromCommit = git(opts.repoRoot, ['rev-parse', opts.fromRef]);
    toCommit = git(opts.repoRoot, ['rev-parse', toRef]);
  } catch (err) {
    return {
      stdout: JSON.stringify({
        error: 'unknown_ref',
        message: err instanceof Error ? err.message.trim() : String(err),
      }),
      exitCode: 1,
    };
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-graph-diff-'));
  try {
    const beforeDir = path.join(scratch, 'before');
    const afterDir = path.join(scratch, 'after');
    materializeRef(opts.repoRoot, fromCommit, beforeDir);
    materializeRef(opts.repoRoot, toCommit, afterDir);

    const delta = diffSnapshots(
      collectGraph(beforeDir).snapshot,
      collectGraph(afterDir).snapshot,
    );
    const full: GraphDelta = {
      from: { ref: opts.fromRef, commit: fromCommit },
      to: { ref: toRef, commit: toCommit },
      ...delta,
    };

    if (opts.json === true) {
      return { stdout: JSON.stringify(full, null, 2), exitCode: 0 };
    }
    return { stdout: render(full), exitCode: 0 };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function render(d: GraphDelta): string {
  const lines = [
    `graph diff ${d.from.ref} (${d.from.commit.slice(0, 8)}) → ${d.to.ref} (${d.to.commit.slice(0, 8)})`,
  ];

  if (d.entities.status_changed.length > 0) {
    lines.push('', 'status moved:');
    for (const s of d.entities.status_changed) {
      lines.push(`  ${s.id}: ${s.from ?? '—'} → ${s.to ?? '—'}`);
    }
  }
  if (d.entities.added.length > 0) {
    lines.push('', `new (${d.entities.added.length}):`);
    for (const e of d.entities.added) {
      lines.push(`  ${e.id} (${e.kind}) — ${e.title}`);
    }
  }
  if (d.entities.removed.length > 0) {
    lines.push('', `gone (${d.entities.removed.length}):`);
    for (const e of d.entities.removed) lines.push(`  ${e.id} (${e.kind})`);
  }
  if (d.edges.added.length > 0) {
    lines.push('', `edges added (${d.edges.added.length}):`);
    for (const e of d.edges.added) lines.push(`  + ${e}`);
  }
  if (d.edges.removed.length > 0) {
    lines.push('', `edges removed (${d.edges.removed.length}):`);
    for (const e of d.edges.removed) lines.push(`  - ${e}`);
  }
  if (d.runs.from !== d.runs.to) {
    lines.push('', `run records: ${d.runs.from} → ${d.runs.to}`);
  }
  if (lines.length === 1) lines.push('', 'no graph-visible change.');
  return lines.join('\n');
}
