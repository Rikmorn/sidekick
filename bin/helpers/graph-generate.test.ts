import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  generateMap,
  generateState,
  MAP_PATH,
  normalizeForDrift,
  parseTaxonomy,
  renderSurfaces,
  runGenerateCli,
  STATE_PATH,
} from './graph-generate.js';
import { runGraphLint, STATE_LINE_CAP } from './graph-lint.js';
import type { GraphSnapshot } from './graph-store.js';

function snapshot(over: Partial<GraphSnapshot> = {}): GraphSnapshot {
  return {
    entities: [],
    edges: [],
    runs: [],
    docs: [],
    meta: { built_at_commit: 'abc1234' },
    ...over,
  };
}

const entity = (id: string, kind: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    kind,
    title: `${id} title`,
    status: null,
    path: `docs/${id}.md`,
    ...over,
  }) as GraphSnapshot['entities'][number];

describe('normalizeForDrift', () => {
  it('blanks the commit stamp so a new commit is not itself drift', () => {
    const a = '# X\n\n**Built at commit:** `aaa`\n\nbody\n';
    const b = '# X\n\n**Built at commit:** `bbb`\n\nbody\n';
    expect(normalizeForDrift(a)).toBe(normalizeForDrift(b));
  });

  it('still sees a real content change', () => {
    const a = '# X\n\n**Built at commit:** `aaa`\n\nbody\n';
    const b = '# X\n\n**Built at commit:** `aaa`\n\nother\n';
    expect(normalizeForDrift(a)).not.toBe(normalizeForDrift(b));
  });
});

describe('generateState', () => {
  const inputs = {
    snapshot: snapshot({
      entities: [
        entity('ops', 'epic', {
          title: 'the knowledge layer',
          status: 'open',
          path: 'docs/work/ops/epic.md',
        }),
        entity('ops-1', 'item', { status: 'done', data: { epic: 'ops' } }),
        entity('ops-2', 'item', { status: 'active', data: { epic: 'ops' } }),
        entity('ops-3', 'item', { status: 'open', data: { epic: 'ops' } }),
        entity('adr-0006', 'adr', { status: 'Proposed' }),
        entity('adr-0007', 'adr', { status: 'Accepted' }),
        entity('backlog:open-one', 'backlog', { status: 'open' }),
        entity('backlog:done-one', 'backlog', { status: 'resolved' }),
      ],
      runs: [
        {
          run_id: 'r1',
          case_id: 'c',
          suite: 's',
          subject_kind: 'agent',
          subject_name: 'a',
          model: null,
          cost_usd: null,
          num_turns: null,
          verdict: 'pass',
          started_at: null,
          duration_ms: null,
        },
      ],
    }),
    lint: { errors: 0, advisories: 7 },
  };

  it('rolls up open epics with progress counts', () => {
    const out = generateState(inputs);
    expect(out).toContain('## Open epics (1)');
    expect(out).toContain('| 1/3 |');
    expect(out).toContain('`ops-2`');
  });

  it('lists active items and drops completed ones', () => {
    const out = generateState(inputs);
    expect(out).toContain('## Active items (1)');
    expect(out).toContain('- `ops-2`');
    expect(out).not.toContain('- `ops-1`');
  });

  it('counts the open backlog and names decisions awaiting sign-off', () => {
    const out = generateState(inputs);
    expect(out).toContain('1 open of 2');
    expect(out).toContain('`adr-0006`');
  });

  it('reports lint health and the bench summary', () => {
    const out = generateState(inputs);
    expect(out).toContain('0 error(s), 7 advisory finding(s)');
    expect(out).toContain('1 record(s), 1 pass, 0 fail');
    expect(out).toContain('no baseline to compare to');
  });

  it('carries no timestamp other than the commit it was built from', () => {
    const out = generateState(inputs);
    expect(out).toContain('**Built at commit:** `abc1234`');
    expect(/\d{4}-\d{2}-\d{2}T/.test(out)).toBe(false);
  });

  it('points at git for the timeline instead of keeping history inline', () => {
    expect(generateState(inputs)).toContain('git log -p docs/STATE.md');
  });

  it('is deterministic', () => {
    expect(generateState(inputs)).toBe(generateState(inputs));
  });
});

describe('parseTaxonomy', () => {
  it('reads the folder table out of the authored docs README', () => {
    const readme = [
      '| Folder | Meaning | Lifecycle |',
      '|---|---|---|',
      '| `docs/` root | Steering docs: `NORTH-STAR.md` — plus generated `STATE.md` | Living (generated, committed, **size-capped** — current state only) |',
      '| [`adr/`](./adr/) | Architecture decisions | Record — status transitions only |',
    ].join('\n');
    const rows = parseTaxonomy(readme);
    expect(rows.length).toBe(2);
    expect(rows[0].folder).toBe('docs/ root');
    expect(rows[1].folder).toBe('adr/');
    expect(rows[1].meaning).toBe('Architecture decisions');
  });

  it('closes a parenthesis it opened when truncating a clause', () => {
    const readme = [
      '| Folder | Meaning | Lifecycle |',
      '|---|---|---|',
      '| `x/` | A (thing | Living (generated, committed — more) |',
    ].join('\n');
    const rows = parseTaxonomy(readme);
    for (const value of [rows[0].meaning, rows[0].lifecycle]) {
      const opens = (value.match(/\(/g) ?? []).length;
      const closes = (value.match(/\)/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });
});

describe('generateMap', () => {
  const snap = snapshot({
    entities: [
      entity('ops', 'epic', { status: 'open', path: 'docs/work/ops/epic.md' }),
      entity('ops-1', 'item', { status: 'done', data: { epic: 'ops' } }),
      entity('adr-0007', 'adr', { status: 'Accepted' }),
      entity('research:memory', 'research'),
      entity('suite:coherence-agent', 'suite'),
      entity('case:coherence-agent/a', 'case'),
      entity('agent:sk-fixer', 'agent', { title: 'Applies a minimal fix.' }),
      entity('helper:hooks', 'helper', { title: 'hooks' }),
      entity('doc:docs/LIMITS.md', 'doc', {
        title: 'Known limits',
        path: 'docs/LIMITS.md',
      }),
    ],
    edges: [
      {
        src: 'case:coherence-agent/a',
        rel: 'measures',
        dst: 'agent:sk-fixer',
        tier: 'EXTRACTED',
        origin: 'x:1',
      },
    ],
  });

  it('states the retrieval ordering, map first and grep last', () => {
    const out = generateMap(snap, []);
    expect(out).toContain('**Retrieval ordering:**');
    expect(out).toContain('grep only when both miss');
  });

  it('lists every live entity class with counts and entry links', () => {
    const out = generateMap(snap, []);
    expect(out).toContain('## Work — 1 epic(s)');
    expect(out).toContain('## Decisions — 1 ADR(s)');
    expect(out).toContain('## Research — 1 topic(s)');
    expect(out).toContain('## Eval suites — 1');
    expect(out).toContain('coherence-agent` — 1 case(s) → agent:sk-fixer');
    expect(out).toContain('[docs/work/ops/epic.md](docs/work/ops/epic.md)');
  });

  it('groups decisions by status so superseded ones are visible as such', () => {
    expect(generateMap(snap, [])).toContain('**Accepted:**');
  });

  it('omits a description that only repeats the name', () => {
    const out = generateMap(snap, []);
    expect(out).toContain('- `hooks`\n');
    expect(out).not.toContain('- `hooks` — hooks');
    expect(out).toContain('- `sk-fixer` — Applies a minimal fix.');
  });

  it('is deterministic', () => {
    expect(generateMap(snap, [])).toBe(generateMap(snap, []));
  });
});

describe('generated surfaces on a repo', () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-gen-'));
    execSync('git init -q -b master', { cwd: repo });
    execSync('git config user.email t@t.example', { cwd: repo });
    execSync('git config user.name T', { cwd: repo });
    const write = (rel: string, content: string): void => {
      fs.mkdirSync(path.join(repo, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(repo, rel), content);
    };
    write(
      'docs/work/ops/epic.md',
      '---\nid: ops\nkind: epic\nstatus: open\n---\n\n# ops — layer',
    );
    write(
      'docs/work/ops/2.md',
      '---\nid: ops-2\nepic: ops\nkind: item\nstatus: active\n---\n\n# ops-2 — Compiler',
    );
    write(
      'docs/README.md',
      [
        '# docs',
        '',
        '| Folder | Meaning | Lifecycle |',
        '|---|---|---|',
        '| `adr/` | Architecture decisions | Record |',
      ].join('\n'),
    );
    execSync('git add -A && git commit -q -m seed', { cwd: repo });
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('regenerating twice produces identical files — idempotent', () => {
    runGenerateCli(repo, 'state', false);
    runGenerateCli(repo, 'map', false);
    const first = {
      state: fs.readFileSync(path.join(repo, STATE_PATH), 'utf-8'),
      map: fs.readFileSync(path.join(repo, MAP_PATH), 'utf-8'),
    };
    runGenerateCli(repo, 'state', false);
    runGenerateCli(repo, 'map', false);
    expect(fs.readFileSync(path.join(repo, STATE_PATH), 'utf-8')).toBe(
      first.state,
    );
    expect(fs.readFileSync(path.join(repo, MAP_PATH), 'utf-8')).toBe(first.map);
  });

  it('reports whether the write changed anything', () => {
    const created = JSON.parse(runGenerateCli(repo, 'map', true).stdout);
    expect(created.changed).toBe(true);
    const rerun = JSON.parse(runGenerateCli(repo, 'map', true).stdout);
    expect(rerun.changed).toBe(false);
  });

  it('stays under the size cap', () => {
    runGenerateCli(repo, 'state', false);
    const lines = fs
      .readFileSync(path.join(repo, STATE_PATH), 'utf-8')
      .split('\n').length;
    expect(lines).toBeLessThanOrEqual(STATE_LINE_CAP);
  });

  it('lint catches drift after a source changes, and passes once regenerated', () => {
    const generated = () => [
      {
        path: STATE_PATH,
        regenerate: () => renderSurfaces(repo).state,
        normalize: normalizeForDrift,
      },
      {
        path: MAP_PATH,
        regenerate: () => renderSurfaces(repo).map,
        normalize: normalizeForDrift,
      },
    ];

    runGenerateCli(repo, 'state', false);
    runGenerateCli(repo, 'map', false);
    expect(
      runGraphLint({ repoRoot: repo, generated: generated() }).exitCode,
    ).toBe(0);

    // Mutate a source: a new item must show up in both surfaces.
    fs.writeFileSync(
      path.join(repo, 'docs/work/ops/3.md'),
      '---\nid: ops-3\nepic: ops\nkind: item\nstatus: active\n---\n\n# ops-3 — Queries',
    );

    const drifted = runGraphLint({
      repoRoot: repo,
      generated: generated(),
      json: true,
    });
    expect(drifted.exitCode).toBe(1);
    // A new item changes both surfaces: STATE lists it as active, MAP counts it
    // under its epic. Both must be flagged, or one of them ships stale.
    expect(
      JSON.parse(drifted.stdout)
        .findings.filter((f: { code: string }) => f.code === 'generated-drift')
        .map((f: { origin: string }) => f.origin)
        .sort(),
    ).toEqual([MAP_PATH, STATE_PATH]);

    runGenerateCli(repo, 'state', false);
    runGenerateCli(repo, 'map', false);
    expect(
      runGraphLint({ repoRoot: repo, generated: generated() }).exitCode,
    ).toBe(0);
  });

  it('does not report drift merely because the commit stamp moved', () => {
    runGenerateCli(repo, 'state', false);
    runGenerateCli(repo, 'map', false);
    execSync('git add -A && git commit -q -m generated', { cwd: repo });
    fs.writeFileSync(path.join(repo, 'unrelated.txt'), 'x');
    execSync('git add -A && git commit -q -m unrelated', { cwd: repo });

    // The stamp in the committed files now names an older commit.
    const res = runGraphLint({
      repoRoot: repo,
      generated: [
        {
          path: STATE_PATH,
          regenerate: () => renderSurfaces(repo).state,
          normalize: normalizeForDrift,
        },
      ],
    });
    expect(res.exitCode).toBe(0);
  });
});

describe('regeneration leaves a current file alone', () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-nowrite-'));
    execSync('git init -q -b master', { cwd: repo });
    execSync('git config user.email t@t.example', { cwd: repo });
    execSync('git config user.name T', { cwd: repo });
    fs.mkdirSync(path.join(repo, 'docs/work/ops'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'docs/work/ops/epic.md'),
      '---\nid: ops\nkind: epic\nstatus: open\n---\n\n# ops — layer',
    );
    execSync('git add -A && git commit -q -m seed', { cwd: repo });
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('does not rewrite the file just to refresh the commit stamp', () => {
    runGenerateCli(repo, 'state', false);
    execSync('git add -A && git commit -q -m generated', { cwd: repo });
    fs.writeFileSync(path.join(repo, 'unrelated.txt'), 'x');
    execSync('git add -A && git commit -q -m unrelated', { cwd: repo });

    const res = runGenerateCli(repo, 'state', false);
    expect(res.stdout).toContain('already current');
    // HEAD moved, but the surface is unchanged — so the tree stays clean.
    expect(execSync('git status --porcelain', { cwd: repo }).toString()).toBe(
      '',
    );
  });
});
