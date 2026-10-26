import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type DeskSnapshot,
  RUN_TIMEOUT_MS,
} from '../../plugin/hooks/desk/contract.js';
import { DESK_USAGE_LINE, type DeskEnv, runDeskCli } from './desk.js';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner, type Runner } from './pm-data.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import { recordsDir, writeRecord } from './worker-record.js';

afterEach(removeTemps);

const NOW = Date.parse('2026-10-15T12:00:00Z');
const MINUTE = 60_000;
const LISTING_ARGS = ['agents', '--json', '--all'];

const JOB = 'aaaa0001';
const CHILD_SESSION = 'aaaa0001-0000-0000-0000-000000000000';

// A main-thread assistant entry, shaped as context-monitor.test.ts builds
// them: its token figure is 2 + `read` + 10.
const usageEntry = (read: number): string =>
  JSON.stringify({
    type: 'assistant',
    isSidechain: false,
    message: {
      usage: {
        input_tokens: 2,
        cache_read_input_tokens: read,
        cache_creation_input_tokens: 10,
      },
    },
  });

// Matches a string that opens with `prefix`; the rest is an OS or git message.
const startingWith = (prefix: string) =>
  expect.stringMatching(
    new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );

const ok = (over: Partial<ClaudeResult> = {}): ClaudeResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
});

const listing = (rows: object[]): ClaudeResult =>
  ok({ stdout: JSON.stringify(rows) });

// Rows follow the measured shapes in docs/research/control-centre/2026-10-15-desk-probes.md
// §The listing, state by state.
const childRow = (over: object = {}) => ({
  id: JOB,
  kind: 'background',
  cwd: '/x/repo/.claude/worktrees/w1',
  pid: 100,
  sessionId: CHILD_SESSION,
  name: 'w1',
  state: 'working',
  status: 'busy',
  ...over,
});
// What `childRow` gives a child's session facts.
const CHILD_SESSION_FACTS = {
  hasPid: true,
  sessionId: CHILD_SESSION,
  kind: 'background',
  status: 'busy',
};
const interactiveRow = (sessionId: string, over: object = {}) => ({
  kind: 'interactive',
  cwd: '/x/other',
  pid: 200,
  sessionId,
  name: `i-${sessionId.slice(0, 4)}`,
  status: 'idle',
  ...over,
});

const briefText = (name: string, plan: string, baseline: string): string =>
  [
    '---',
    `name: ${name}`,
    `plan: ${plan}`,
    `spec: ${path.join(path.dirname(plan), 'spec.md')}`,
    `rulings: ${path.join(path.dirname(plan), 'rulings.md')}`,
    `baseline: ${baseline}`,
    'skill: subagent-driven-development',
    'place: worktree',
    'report: docs/run-report.md',
    'orchestrator: orch',
    '---',
    '',
  ].join('\n');

/**
 * A main checkout with worker `w1`: its brief and plan under `docs/`, its
 * record, and its worktree on `worktree-w1` holding one commit, "work".
 * `addWorker` adds another record, and its worktree when asked.
 */
function repoFixture() {
  const top = repo();
  const docs = path.join(top, 'docs');
  fs.mkdirSync(docs);
  const plan = path.join(docs, 'plan.md');
  fs.writeFileSync(plan, 'Intro\n# The plan title\n\n## Task 1\n');
  const commonDir = path.join(top, '.git');
  const worktreeOf = (name: string) =>
    path.join(top, '.claude', 'worktrees', name);
  const addWorker = (
    name: string,
    job: string | null,
    opts: { worktree?: boolean; brief?: string } = {},
  ): string => {
    const brief = opts.brief ?? path.join(docs, `${name}-brief.md`);
    if (opts.brief === undefined) {
      fs.writeFileSync(
        brief,
        briefText(name, plan, git(top, 'rev-parse', 'HEAD')),
      );
    }
    writeRecord(commonDir, {
      version: 2,
      name,
      main: null,
      job,
      brief,
      dispatchedAt: '2026-10-15T11:00:00Z',
    });
    const worktree = worktreeOf(name);
    if (opts.worktree ?? true) {
      git(top, 'worktree', 'add', '-q', worktree, '-b', `worktree-${name}`);
    }
    return worktree;
  };
  const worktree = addWorker('w1', JOB);
  fs.writeFileSync(path.join(worktree, 'b.txt'), 'b\n');
  git(worktree, 'add', 'b.txt');
  git(worktree, 'commit', '-q', '-m', 'work');
  return { top, docs, worktree, commonDir, addWorker, worktreeOf };
}

/** A config folder whose `projects/` holds transcripts, each modified `ageMinutes` before `NOW`. */
function configFixture() {
  const configDir = tmp();
  const transcript = (
    sessionId: string,
    lines: string[],
    ageMinutes = 0,
    project = '-x-repo',
  ): string => {
    const dir = path.join(configDir, 'projects', project);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sessionId}.jsonl`);
    fs.writeFileSync(file, `${lines.join('\n')}\n`);
    const at = (NOW - ageMinutes * MINUTE) / 1000;
    fs.utimesSync(file, at, at);
    return file;
  };
  return { configDir, transcript };
}

interface Call {
  args: string[];
  opts: { cwd: string; timeoutMs: number };
}

function harness(
  cwd: string,
  result: ClaudeResult,
  configDir = tmp(),
  runGit: Runner = execRunner,
) {
  const calls: Call[] = [];
  const runClaude: ClaudeRunner = (args, opts) => {
    calls.push({ args, opts });
    return result;
  };
  const denv: DeskEnv = {
    cwd,
    configDir,
    runClaude,
    runGit,
    now: () => NOW,
  };
  const run = (...args: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = runDeskCli(
      args,
      denv,
      (l) => out.push(l),
      (l) => err.push(l),
    );
    return { code, out, err };
  };
  return { calls, run };
}

type OkSnapshot = Extract<DeskSnapshot, { ok: true }>;

// Runs `--json` with `args`, expecting exit 0 and one line holding an ok snapshot.
function snapshotOf(h: ReturnType<typeof harness>, ...args: string[]) {
  const r = h.run('--json', ...args);
  expect(r.code).toBe(0);
  expect(r.err).toEqual([]);
  expect(r.out).toHaveLength(1);
  const parsed: DeskSnapshot = JSON.parse(r.out[0]);
  if (!parsed.ok) throw new Error(`expected an ok snapshot: ${r.out[0]}`);
  const snapshot: OkSnapshot = parsed;
  return snapshot;
}

describe('runDeskCli: usage', () => {
  test.each([
    ['no arguments', []],
    ['no --json', ['--self', 'abc']],
    ['an unknown flag', ['--json', '--bogus']],
    ['--self with no value', ['--json', '--self']],
    ['a stray argument', ['--json', 'extra']],
  ])('%s prints the usage on err and returns 1', (_label, args) => {
    const h = harness(tmp(), listing([]));
    const r = h.run(...args);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual([`usage: ${DESK_USAGE_LINE}`]);
    expect(h.calls).toEqual([]);
  });

  test('the usage line names --json and --self', () => {
    expect(DESK_USAGE_LINE).toBe('sidekick desk --json [--self <session id>]');
  });
});

describe('runDeskCli: a failing listing', () => {
  test.each([
    [
      'a non-zero exit',
      ok({ code: 1, stderr: 'boom\nmore\n' }),
      'claude agents --json --all failed with exit code 1: boom',
    ],
    [
      'a timeout',
      ok({ code: 1, timedOut: true }),
      'claude agents --json --all did not return in time',
    ],
    [
      'JSON that is not an array',
      ok({ stdout: '{}' }),
      'claude agents --json --all printed a listing that is not a JSON array',
    ],
  ])('%s prints a failure snapshot and returns 0', (_label, result, error) => {
    const r = harness(tmp(), result).run('--json');
    expect(r.code).toBe(0);
    expect(r.out.map((l) => JSON.parse(l))).toEqual([
      { version: 2, ok: false, error },
    ]);
  });

  test('output that is not JSON prints a failure snapshot naming why', () => {
    const r = harness(tmp(), ok({ stdout: 'nope' })).run('--json');
    expect(r.code).toBe(0);
    const parsed: DeskSnapshot = JSON.parse(r.out[0]);
    expect(parsed).toEqual({
      version: 2,
      ok: false,
      error: startingWith(
        'claude agents --json --all printed a listing that is not JSON: ',
      ),
    });
  });

  test('the listing runs in cwd, timing out before the mod kills the run', () => {
    const cwd = tmp();
    const h = harness(cwd, listing([]));
    h.run('--json');
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].args).toEqual(LISTING_ARGS);
    expect(h.calls[0].opts.cwd).toBe(cwd);
    expect(h.calls[0].opts.timeoutMs).toBeLessThan(RUN_TIMEOUT_MS);
  });
});

describe('runDeskCli: outside a repository', () => {
  test('gives an ok snapshot with no children and no repo', () => {
    const rows = [interactiveRow('bbbb0001-0000-0000-0000-000000000000')];
    const s = snapshotOf(harness(tmp(), listing(rows)));
    expect(s.children).toEqual([]);
    expect(s.repo).toBeUndefined();
    expect(s.others).toHaveLength(1);
    expect(s.warnings).toEqual([]);
  });
});

describe('runDeskCli: children', () => {
  test("a child carries its git facts, its plan's title, and its tokens", () => {
    const fx = repoFixture();
    fs.writeFileSync(path.join(fx.worktree, 'c.txt'), 'uncommitted\n');
    const config = configFixture();
    config.transcript(CHILD_SESSION, [usageEntry(5), usageEntry(1000)]);
    const h = harness(fx.top, listing([childRow()]), config.configDir);
    const s = snapshotOf(h);
    expect(s.repo).toBe(path.basename(fx.top));
    expect(s.children).toEqual([
      {
        ...CHILD_SESSION_FACTS,
        name: 'w1',
        state: 'working',
        tokens: 1012,
        plan: 'The plan title',
        lastCommit: 'work',
        unintegrated: 1,
        uncommitted: true,
      },
    ]);
    expect(s.others).toEqual([]);
    expect(s.warnings).toEqual([]);
  });

  test("a session in a linked worktree sees its repository's children", () => {
    const fx = repoFixture();
    const s = snapshotOf(harness(fx.worktree, listing([childRow()])));
    expect(s.repo).toBe(path.basename(fx.top));
    expect(s.children).toEqual([
      {
        ...CHILD_SESSION_FACTS,
        name: 'w1',
        state: 'working',
        plan: 'The plan title',
        lastCommit: 'work',
        unintegrated: 1,
        uncommitted: false,
      },
    ]);
  });

  test('a child with no transcript has no tokens, and no warning', () => {
    const fx = repoFixture();
    const s = snapshotOf(harness(fx.top, listing([childRow()])));
    expect(s.children[0].tokens).toBeUndefined();
    expect(s.warnings).toEqual([]);
  });

  test('a transcript that cannot be read leaves tokens out, with a warning', () => {
    const fx = repoFixture();
    const config = configFixture();
    const file = config.transcript(CHILD_SESSION, [usageEntry(1000)]);
    fs.chmodSync(file, 0o000);
    const s = snapshotOf(
      harness(fx.top, listing([childRow()]), config.configDir),
    );
    fs.chmodSync(file, 0o600);
    expect(s.children[0].tokens).toBeUndefined();
    expect(s.warnings).toEqual([
      startingWith(`w1: cannot read the transcript ${file}: `),
    ]);
  });

  test('a brief that cannot be read leaves the plan out, with a warning', () => {
    const fx = repoFixture();
    const missing = path.join(fx.docs, 'missing-brief.md');
    fx.addWorker('w2', 'bbbb0002', { brief: missing });
    const rows = [
      childRow(),
      childRow({ id: 'bbbb0002', name: 'w2', sessionId: undefined }),
    ];
    const s = snapshotOf(harness(fx.top, listing(rows)));
    expect(s.children.map((c) => [c.name, c.plan])).toEqual([
      ['w1', 'The plan title'],
      ['w2', undefined],
    ]);
    expect(s.warnings).toEqual([
      startingWith(`w2: no plan title: ${missing}: cannot read the brief: `),
    ]);
  });

  test('a failed git call leaves its field out or at its default, with a warning naming the child and the call', () => {
    const fx = repoFixture();
    const worktree = fx.addWorker('w3', 'cccc0003', { worktree: false });
    fs.mkdirSync(worktree, { recursive: true });
    fs.writeFileSync(path.join(worktree, '.git'), 'gitdir: /nonexistent/w3\n');
    const rows = [
      childRow(),
      childRow({ id: 'cccc0003', name: 'w3', sessionId: undefined }),
    ];
    const s = snapshotOf(harness(fx.top, listing(rows)));
    expect(s.children.find((c) => c.name === 'w3')).toEqual({
      hasPid: true,
      kind: 'background',
      status: 'busy',
      name: 'w3',
      state: 'working',
      plan: 'The plan title',
      unintegrated: 0,
      uncommitted: false,
    });
    expect(s.warnings).toEqual([
      startingWith(`w3: git log failed in ${worktree}: `),
      startingWith(`w3: git status failed in ${worktree}: `),
      startingWith(`w3: git rev-list failed in ${fx.top}: `),
    ]);
  });

  test('a record that does not parse is skipped with a warning', () => {
    const fx = repoFixture();
    const bad = path.join(recordsDir(fx.commonDir), 'bad.json');
    fs.writeFileSync(bad, '{}');
    const s = snapshotOf(harness(fx.top, listing([childRow()])));
    expect(s.children.map((c) => c.name)).toEqual(['w1']);
    expect(s.warnings).toEqual([startingWith(`${bad} is not a worker record`)]);
  });
});

describe('runDeskCli: git in a worker', () => {
  // `git help status` §BACKGROUND REFRESH: status writes the refreshed index
  // under a lock, which can fail the worker's own commit.
  test("git status runs without optional locks, so it never takes the worker's index lock", () => {
    const fx = repoFixture();
    const gitCalls: string[][] = [];
    const recording: Runner = (cmd, args, cwd) => {
      gitCalls.push(args);
      return execRunner(cmd, args, cwd);
    };
    snapshotOf(harness(fx.top, listing([childRow()]), tmp(), recording));
    expect(gitCalls.filter((args) => args.includes('status'))).toEqual([
      ['--no-optional-locks', 'status', '--porcelain'],
    ]);
  });
});

describe('runDeskCli: a missing worktree', () => {
  test('a child whose worktree folder is gone still lists, with one warning', () => {
    const fx = repoFixture();
    fs.rmSync(fx.worktree, { recursive: true, force: true });
    const s = snapshotOf(harness(fx.top, listing([childRow()])));
    expect(s.children).toEqual([
      {
        ...CHILD_SESSION_FACTS,
        name: 'w1',
        state: 'working',
        plan: 'The plan title',
        unintegrated: 1,
        uncommitted: false,
      },
    ]);
    expect(s.warnings).toEqual([`w1: its worktree ${fx.worktree} is missing`]);
  });

  test('a missing branch adds no second warning', () => {
    const fx = repoFixture();
    fs.rmSync(fx.worktree, { recursive: true, force: true });
    git(fx.top, 'worktree', 'prune');
    git(fx.top, 'branch', '-D', '-q', 'worktree-w1');
    const s = snapshotOf(harness(fx.top, listing([childRow()])));
    expect(s.children[0].unintegrated).toBe(0);
    expect(s.warnings).toEqual([`w1: its worktree ${fx.worktree} is missing`]);
  });
});

describe('runDeskCli: freshness', () => {
  // Each session runs alone, so the count names it. Its transcript sits in a
  // project folder beside another, so the scan covers more than one.
  test.each([
    ['a transcript 29 minutes old counts', 29, 1],
    ['a transcript 31 minutes old does not count', 31, 0],
    ['no transcript does not count', undefined, 0],
  ])('an idle interactive session: %s', (_label, ageMinutes, finished) => {
    const config = configFixture();
    const session = 'cccc0001-0000-0000-0000-000000000000';
    config.transcript('ffff0009-0000-0000-0000-000000000000', [], 0);
    if (ageMinutes !== undefined) {
      config.transcript(session, [usageEntry(1)], ageMinutes, '-y-other');
    }
    const rows = [interactiveRow(session)];
    const s = snapshotOf(harness(tmp(), listing(rows), config.configDir));
    expect(s.finished).toBe(finished);
    expect(s.others).toHaveLength(1);
  });
});

describe('runDeskCli: pruning', () => {
  test('a record whose job and worktree are both gone is deleted and not listed', () => {
    const fx = repoFixture();
    fx.addWorker('w2', 'gone0002', { worktree: false });
    const kept = fx.addWorker('w4', 'gone0004');
    const s = snapshotOf(harness(fx.top, listing([childRow()])));
    expect(fs.existsSync(path.join(recordsDir(fx.commonDir), 'w2.json'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(recordsDir(fx.commonDir), 'w4.json'))).toBe(
      true,
    );
    expect(s.children.map((c) => [c.name, c.state])).toEqual([
      ['w1', 'working'],
      ['w4', 'gone'],
    ]);
    expect(fs.existsSync(kept)).toBe(true);
    expect(s.warnings).toEqual([]);
  });
});

describe('runDeskCli: self', () => {
  test('--self leaves that session out', () => {
    const me = 'ffff0001-0000-0000-0000-000000000000';
    const other = 'ffff0002-0000-0000-0000-000000000000';
    const rows = [
      interactiveRow(me, {
        status: 'waiting',
        waitingFor: 'permission prompt',
      }),
      interactiveRow(other),
    ];
    const h = harness(tmp(), listing(rows));
    expect(snapshotOf(h).waiting).toHaveLength(1);
    const s = snapshotOf(h, '--self', me);
    expect(s.waiting).toEqual([]);
    expect(s.others.map((o) => o.name)).toEqual([`i-${other.slice(0, 4)}`]);
    expect(s.self).toMatchObject({ sessionId: me, status: 'waiting' });
    expect(s.sessionIds).toEqual([me, other]);
  });

  test('a record whose main is the caller’s listing name is its child', () => {
    const fx = repoFixture();
    const me = 'ffff0001-0000-0000-0000-000000000000';
    writeRecord(fx.commonDir, {
      version: 2,
      name: 'w2',
      main: 'mine',
      job: 'aaaa0002',
      brief: path.join(fx.docs, 'w1-brief.md'),
      dispatchedAt: '2026-10-15T11:00:00Z',
    });
    git(fx.top, 'worktree', 'add', '-q', fx.worktreeOf('w2'), '-b', 'wt-w2');
    const rows = [
      childRow({ id: 'aaaa0002', name: 'w2', sessionId: 'aaaa0002-x' }),
      interactiveRow(me, { name: 'mine' }),
    ];
    const h = harness(fx.top, listing(rows));
    const mine = snapshotOf(h, '--self', me);
    expect(mine.children.map((c) => c.name).sort()).toEqual(['w1', 'w2']);
    // A caller of another name keeps w1 (no main) but not w2.
    const other = interactiveRow('ffff0003-0000-0000-0000-000000000000', {
      name: 'someone',
    });
    const elsewhere = snapshotOf(
      harness(fx.top, listing([...rows, other])),
      '--self',
      'ffff0003-0000-0000-0000-000000000000',
    );
    expect(elsewhere.children.map((c) => c.name)).toEqual(['w1']);
  });

  test('a done child with no pid still gets its job detail', () => {
    const fx = repoFixture();
    const configDir = tmp();
    fs.mkdirSync(path.join(configDir, 'jobs', JOB), { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'jobs', JOB, 'state.json'),
      '{"detail":"report sent"}',
    );
    const done = { ...childRow({ state: 'done', status: undefined }) };
    const { pid: _pid, ...exited } = done;
    const s = snapshotOf(harness(fx.top, listing([exited]), configDir));
    expect(s.children[0]).toMatchObject({
      state: 'done',
      hasPid: false,
      detail: 'report sent',
    });
  });

  test('two mains in one repository each list only their own worker', () => {
    const fx = repoFixture();
    const me = 'ffff0001-0000-0000-0000-000000000000';
    const sibling = 'ffff0002-0000-0000-0000-000000000000';
    // The record `w1` of the fixture belongs to no main; `w2` to the sibling.
    writeRecord(fx.commonDir, {
      version: 2,
      name: 'w2',
      main: 'sibling',
      job: 'aaaa0002',
      brief: path.join(fx.docs, 'w1-brief.md'),
      dispatchedAt: '2026-10-15T11:00:00Z',
    });
    git(fx.top, 'worktree', 'add', '-q', fx.worktreeOf('w2'), '-b', 'wt-w2');
    const rows = [
      childRow(),
      childRow({ id: 'aaaa0002', name: 'w2', sessionId: 'aaaa0002-x' }),
      interactiveRow(me, { name: 'mine', cwd: fx.top }),
      interactiveRow(sibling, { name: 'sibling', cwd: fx.top }),
    ];
    const h = harness(fx.top, listing(rows));
    expect(snapshotOf(h, '--self', me).children.map((c) => c.name)).toEqual([
      'w1',
    ]);
    const theirs = snapshotOf(h, '--self', sibling);
    expect(theirs.children.map((c) => c.name).sort()).toEqual(['w1', 'w2']);
  });

  test('a version-1 record on disk is a child of either main', () => {
    const fx = repoFixture();
    const file = path.join(recordsDir(fx.commonDir), 'w1.json');
    const { main: _main, ...rest } = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...rest, version: 1 }));
    const me = 'ffff0001-0000-0000-0000-000000000000';
    const rows = [childRow(), interactiveRow(me, { name: 'mine' })];
    const h = harness(fx.top, listing(rows));
    expect(snapshotOf(h, '--self', me).children.map((c) => c.name)).toEqual([
      'w1',
    ]);
  });

  test('a background row reads job state from the config folder', () => {
    const configDir = tmp();
    fs.mkdirSync(path.join(configDir, 'jobs', JOB), { recursive: true });
    fs.mkdirSync(path.join(configDir, 'jobs', 'bbbb0002'), { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'jobs', JOB, 'state.json'),
      '{"detail":"running tests","needs":"a yes","extra":{}}',
    );
    fs.writeFileSync(
      path.join(configDir, 'jobs', 'bbbb0002', 'state.json'),
      'not json',
    );
    const rows = [
      childRow(),
      childRow({ id: 'bbbb0002', name: 'b2', sessionId: 'bbbb0002-x' }),
    ];
    const s = snapshotOf(harness(tmp(), listing(rows), configDir));
    const byName = (name: string) => s.others.find((o) => o.name === name);
    expect(byName('w1')?.detail).toBe('running tests');
    expect(byName('w1')).not.toHaveProperty('needs');
    expect(s.paneWarnings).toEqual(['b2: its job state is not JSON']);
    expect(s.warnings).toEqual([]);
  });
});

describe('runDeskCli: what a waiting session asked', () => {
  const SESSION = 'cccc0001-0000-0000-0000-000000000000';
  const said = (content: unknown, isSidechain = false): string =>
    JSON.stringify({ type: 'assistant', isSidechain, message: { content } });
  const text = (value: string) => [{ type: 'text', text: value }];

  test.each([
    [
      'the first non-empty line of its last message',
      [said(text('Earlier.')), said(text('\n Which colour?\nRed or blue.'))],
      'Which colour?',
    ],
    [
      'none when its last message is a tool call',
      [
        said(text('Reading the brief.')),
        said([{ type: 'tool_use', name: 'Read', input: {} }]),
      ],
      undefined,
    ],
    [
      "a subagent's message is passed over",
      [said(text('Which colour?')), said(text('a subagent'), true)],
      'Which colour?',
    ],
    ['a message given as a string', [said('Ready to push?')], 'Ready to push?'],
  ])('a waiting session: %s', (_label, lines, asked) => {
    const config = configFixture();
    config.transcript(SESSION, lines);
    const rows = [interactiveRow(SESSION, { status: 'waiting' })];
    const s = snapshotOf(harness(tmp(), listing(rows), config.configDir));
    expect(s.others[0]?.asked).toBe(asked);
    expect(s.waiting[0]?.asked).toBe(asked);
  });

  test('a session that does not wait asks nothing, whatever its transcript says', () => {
    const config = configFixture();
    config.transcript(SESSION, [said(text('Which colour?'))]);
    const rows = [interactiveRow(SESSION)];
    const s = snapshotOf(harness(tmp(), listing(rows), config.configDir));
    expect(s.others[0]).not.toHaveProperty('asked');
  });
});
