import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import { LAUNCH_TIMEOUT_MS } from './profile.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import { runWorkerCli, type WorkerEnv } from './worker.js';
import {
  PUSH_DENY_RULE,
  PUSH_REWRITE_KEY,
  SAVE_SKILL_RULE,
} from './worker-overlay.js';

afterEach(removeTemps);

const LIMITS_SECTION =
  '## Limits\n\nWrite only inside the worktree; never push.\n';

// `body` replaces the gates line and the limits section, for a brief that lacks the section.
const briefText = (
  fields: Record<string, string>,
  body = `Gates at the baseline: all pass.\n\n${LIMITS_SECTION}`,
): string =>
  `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n\n${body}`;

/**
 * A repo whose `docs/` holds a plan, a spec, and a brief named `w1` at `HEAD`,
 * and a profile store holding `worker`. `rewrite` replaces brief fields.
 */
function fixture(manifest: object = { description: 'Worker' }) {
  const top = repo();
  const docs = path.join(top, 'docs');
  fs.mkdirSync(docs);
  fs.writeFileSync(path.join(docs, 'plan.md'), '# plan\n');
  fs.writeFileSync(path.join(docs, 'spec.md'), '# spec\n');
  const head = git(top, 'rev-parse', 'HEAD');
  const store = tmp();
  fs.mkdirSync(path.join(store, 'worker'));
  fs.writeFileSync(
    path.join(store, 'worker', 'profile.json'),
    JSON.stringify(manifest),
  );
  const fields: Record<string, string> = {
    name: 'w1',
    plan: path.join(docs, 'plan.md'),
    spec: path.join(docs, 'spec.md'),
    rulings: path.join(docs, 'rulings.md'),
    baseline: head,
    skill: 'subagent-driven-development',
    place: 'worktree',
    report: 'docs/run-report.md',
    orchestrator: 'orch',
    target: git(top, 'symbolic-ref', '--short', 'HEAD'),
  };
  const brief = path.join(docs, 'x-brief.md');
  const rewrite = (over: Record<string, string>): void =>
    fs.writeFileSync(brief, briefText({ ...fields, ...over }));
  rewrite({});
  return { top, docs, head, store, brief, rewrite, fields };
}

type Fixture = ReturnType<typeof fixture>;

const allowRulesOf = (fx: Fixture): string[] => [
  ...[fx.brief, fx.fields.plan, fx.fields.spec, fx.fields.rulings].map(
    (p) => `Read(/${p})`,
  ),
  SAVE_SKILL_RULE,
];

const ok = (over: Partial<ClaudeResult> = {}): ClaudeResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
});

interface Call {
  args: string[];
  opts: { cwd: string; timeoutMs: number };
}

const JOB = '213245a1';

/**
 * What Claude Code's own creation does for `--worktree <name>`: a worktree at
 * `<main>/.claude/worktrees/<name>` on `worktree-<name>`, from the launching
 * checkout's HEAD. It returns the folder the job then lists as its cwd.
 */
const nativeLanding =
  (mainTop: string) =>
  (launchCwd: string, name: string): string | undefined => {
    const where = path.join(mainTop, '.claude', 'worktrees', name);
    git(launchCwd, 'worktree', 'add', '-q', where, '-b', `worktree-${name}`);
    return where;
  };

// A commit beside the baseline, made without moving HEAD.
const offBaseline = (fx: { top: string; head: string }): string =>
  git(fx.top, 'commit-tree', `${fx.head}^{tree}`, '-p', fx.head, '-m', 'off');

// Claude Code's own folder and branch, created at a commit other than the baseline.
const offBaselineLanding =
  (fx: { top: string }, at: string) =>
  (launchCwd: string, name: string): string => {
    const where = path.join(fx.top, '.claude', 'worktrees', name);
    git(
      launchCwd,
      'worktree',
      'add',
      '-q',
      where,
      '-b',
      `worktree-${name}`,
      at,
    );
    return where;
  };

/**
 * Plays `doctor` with the canary's line, `plugin list --json`, `stop`, and the
 * agents listing from `state.agents`; any other call is the launch. A launch
 * that exits 0 runs `state.land`, and the listing then adds the job's row at
 * the folder it returns, or no row when it returns undefined.
 */
function fakeClaude(mainTop: string) {
  const calls: Call[] = [];
  const state = {
    agents: '[]',
    launch: ok({ stdout: `backgrounded · ${JOB} · w1\n` }),
    land: nativeLanding(mainTop),
    stop: ok(),
  };
  let launched: string | undefined;
  const afterLaunch = (opts: Call['opts'], args: string[]): string => {
    const name = args[args.indexOf('--worktree') + 1];
    const cwd = state.land(opts.cwd, name);
    const rows: object[] = JSON.parse(state.agents);
    const row = { id: JOB, kind: 'background', name, cwd, state: 'working' };
    return JSON.stringify(cwd === undefined ? rows : [...rows, row]);
  };
  const run: ClaudeRunner = (args, opts) => {
    calls.push({ args, opts });
    if (args.at(-1) === 'doctor') {
      const file = args[args.indexOf('--settings') + 1];
      const key = Object.keys(JSON.parse(fs.readFileSync(file, 'utf-8'))).find(
        (k) => k === 'feedbackSurveyRate' || k === 'cleanupPeriodDays',
      );
      return ok({
        stdout: `Invalid settings\n- ${file} › ${key}: Expected number, but received string\n\n`,
      });
    }
    if (args.at(-3) === 'plugin' && args.at(-2) === 'list') {
      return ok({ stdout: '[]' });
    }
    if (args[0] === 'agents') return ok({ stdout: launched ?? state.agents });
    if (args[0] === 'stop') return state.stop;
    if (state.launch.code === 0) launched = afterLaunch(opts, args);
    return state.launch;
  };
  const launches = (): Call[] => calls.filter((c) => c.args.includes('--bg'));
  const stops = (): Call[] => calls.filter((c) => c.args[0] === 'stop');
  return { run, calls, state, launches, stops };
}

function harness(fx: Fixture, over: Partial<WorkerEnv> = {}) {
  const claude = fakeClaude(fx.top);
  const out: string[] = [];
  const err: string[] = [];
  const wenv: WorkerEnv = {
    env: { SIDEKICK_PROFILES_DIR: fx.store },
    cwd: fx.top,
    home: '/home/test',
    workTree: fx.top,
    tmpdir: tmp(),
    runClaude: claude.run,
    write: () => {},
    runGit: execRunner,
    sleep: () => {},
    isAlive: () => false,
    ...over,
  };
  const dispatch = (...args: string[]) =>
    runWorkerCli(
      ['dispatch', ...args],
      wenv,
      (l) => out.push(l),
      (l) => err.push(l),
    );
  return { claude, out, err, dispatch };
}

type Harness = ReturnType<typeof harness>;

const settingsOf = (call: Call): Record<string, unknown> =>
  JSON.parse(call.args[call.args.indexOf('--settings') + 1]);

// The one launch, failing the test when there is none or several.
function onlyLaunch(h: Harness): Call {
  const launches = h.claude.launches();
  expect(launches).toHaveLength(1);
  return launches[0];
}

function expectRefused(h: Harness, code: number, line: string): void {
  expect(code).toBe(1);
  expect(h.err).toContain(line);
  expect(h.claude.launches()).toEqual([]);
}

/**
 * A linked worktree of the fixture repo on its own branch, with a brief in its
 * own `docs/`. The plan and the spec stay in the main checkout.
 */
function sibling(fx: Fixture, where: string, branch = 'sib') {
  git(fx.top, 'worktree', 'add', '-q', where, '-b', branch);
  const top = fs.realpathSync(where);
  fs.mkdirSync(path.join(top, 'docs'));
  const text = (over: Record<string, string> = {}): string =>
    briefText({
      ...fx.fields,
      rulings: path.join(top, 'docs', 'rulings.md'),
      target: branch,
      ...over,
    });
  const brief = path.join(top, 'docs', 'x-brief.md');
  fs.writeFileSync(brief, text());
  return { top, brief, branch, text };
}

describe('dispatch refuses', () => {
  test('a brief that fails to parse, and checks nothing else', () => {
    const fx = fixture();
    fs.writeFileSync(fx.brief, 'no frontmatter\n');
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'nope');
    expect(code).toBe(1);
    expect(h.err).toEqual([`${fx.brief}: the brief must open with a --- line`]);
    expect(h.claude.calls).toEqual([]);
  });

  test('a plan that does not exist', () => {
    const fx = fixture();
    const missing = path.join(fx.docs, 'nope.md');
    fx.rewrite({ plan: missing });
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(h, code, `plan: ${missing} does not exist`);
  });

  test('a place other than worktree', () => {
    const fx = fixture();
    fx.rewrite({ place: 'in-place' });
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      'place: "in-place" is not "worktree"; dispatch starts a worker only in a worktree of its own',
    );
  });

  test('a baseline that is not HEAD', () => {
    const fx = fixture();
    git(fx.top, 'commit', '-q', '--allow-empty', '-m', 'later');
    const head = git(fx.top, 'rev-parse', 'HEAD');
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      `baseline: ${fx.head} does not resolve to this checkout's HEAD (${head})`,
    );
  });

  test('a modified tracked file', () => {
    const fx = fixture();
    fs.writeFileSync(path.join(fx.top, 'a.txt'), 'changed\n');
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      "tracked files have uncommitted changes, which the worker's worktree would not carry: commit them first",
    );
  });

  test.each([
    ['a background job', { id: 'abc', kind: 'background', name: 'w1' }],
    ['an interactive session', { pid: 7, kind: 'interactive', name: 'w1' }],
  ])('a name taken by %s', (_label, row) => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.agents = JSON.stringify([row]);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      'name: claude agents --json --all already lists a session named "w1"',
    );
  });

  test('a name taken by a worktree folder', () => {
    const fx = fixture();
    const folder = path.join(fx.top, '.claude', 'worktrees', 'w1');
    fs.mkdirSync(folder, { recursive: true });
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(h, code, `name: ${folder} already exists`);
  });

  test('a name taken by a branch', () => {
    const fx = fixture();
    git(fx.top, 'branch', 'worktree-w1');
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      'name: the branch worktree-w1 already exists: once you have checked that its commits have landed, delete it with git branch -D worktree-w1, or dispatch under another name',
    );
  });

  test('an agents listing that does not parse', () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.agents = 'not json';
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expect(code).toBe(1);
    expect(h.err.some((l) => l.includes('is not JSON'))).toBe(true);
    expect(h.claude.launches()).toEqual([]);
  });

  test('a remote with a pushurl', () => {
    const fx = fixture();
    git(fx.top, 'remote', 'add', 'origin', '/nowhere/a');
    git(fx.top, 'config', 'remote.origin.pushurl', '/nowhere/b');
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      'remote "origin" sets pushurl, and git ignores the push rewrite for such a remote: remove the pushurl, or pass --allow-push on the operator\'s word',
    );
  });

  test('a missing --permission-mode', () => {
    const fx = fixture();
    const h = harness(fx);
    const code = h.dispatch(fx.brief);
    expectRefused(
      h,
      code,
      "--permission-mode is required: pass the orchestrating session's own mode, one of default, acceptEdits, plan, auto, dontAsk, bypassPermissions, manual",
    );
  });

  test('an unknown permission mode', () => {
    const fx = fixture();
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'yolo');
    expectRefused(
      h,
      code,
      '--permission-mode "yolo" is not one of default, acceptEdits, plan, auto, dontAsk, bypassPermissions, manual',
    );
  });

  test('a --plugin-dir that is not a folder', () => {
    const fx = fixture();
    const h = harness(fx);
    const code = h.dispatch(
      fx.brief,
      '--permission-mode',
      'auto',
      '--plugin-dir',
      'nowhere',
    );
    expectRefused(
      h,
      code,
      `--plugin-dir: ${path.join(fx.top, 'nowhere')} is not a folder`,
    );
  });

  test('bypassPermissions for a profile without the user setting source', () => {
    const fx = fixture({ description: 'W', settingSources: ['project'] });
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'bypassPermissions');
    expectRefused(
      h,
      code,
      'bypassPermissions needs the user setting source, which profile "worker" leaves out (settingSources: project); a background session without it drops the bypass acceptance',
    );
  });

  test('a missing profile, with the hint to create it', () => {
    const fx = fixture();
    fs.rmSync(path.join(fx.store, 'worker'), { recursive: true });
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      'create it with: sidekick profile new worker --description <text>',
    );
    expect(h.err).toContain(`no profile named "worker"; searched: ${fx.store}`);
  });

  test('a run inside a worker', () => {
    const fx = fixture();
    const h = harness(fx, {
      env: { SIDEKICK_PROFILES_DIR: fx.store, SIDEKICK_WORKER: '/x/brief.md' },
    });
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      'SIDEKICK_WORKER is set: a worker cannot dispatch workers of its own (#255)',
    );
  });

  test('a brief with no target', () => {
    const fx = fixture();
    const { target: _target, ...rest } = fx.fields;
    fs.writeFileSync(fx.brief, briefText(rest));
    const branch = git(fx.top, 'symbolic-ref', '--short', 'HEAD');
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      `target: missing; this checkout holds the branch ${branch}: add the line "target: ${branch}" to the brief`,
    );
  });

  test.each([
    ['no section', 'Gates at the baseline: all pass.\n'],
    ['an empty section', 'Gates at the baseline: all pass.\n\n## Limits\n'],
    ['an h3 heading', 'Gates.\n\n### Limits\n\nWrite only here.\n'],
    [
      'a longer heading',
      'Gates.\n\n## Limits that bind the run\n\nWrite only here.\n',
    ],
  ])('a brief with %s in place of ## Limits', (_name, body) => {
    const fx = fixture();
    fs.writeFileSync(fx.brief, briefText(fx.fields, body));
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expect(code).toBe(1);
    const line = h.err.find((l) => l.includes('## Limits'));
    expect(line).toContain(fx.brief);
    expect(line).toContain('where the worker may write');
    expect(h.claude.launches()).toEqual([]);
  });

  test('a brief with no ## Limits and no target reports both', () => {
    const fx = fixture();
    const { target: _target, ...rest } = fx.fields;
    fs.writeFileSync(fx.brief, briefText(rest, 'Gates.\n'));
    const h = harness(fx);
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(1);
    expect(h.err.some((l) => l.startsWith('target: missing'))).toBe(true);
    expect(h.err.some((l) => l.includes('## Limits'))).toBe(true);
  });

  test('a target other than the branch the checkout holds', () => {
    const fx = fixture();
    fx.rewrite({ target: 'elsewhere' });
    const branch = git(fx.top, 'symbolic-ref', '--short', 'HEAD');
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      `target: "elsewhere" is not the branch this checkout holds (${branch}); write the line "target: ${branch}"`,
    );
  });

  test('a target that starts with a dash is compared, never given to git', () => {
    const fx = fixture();
    fx.rewrite({ target: '--help' });
    const branch = git(fx.top, 'symbolic-ref', '--short', 'HEAD');
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      `target: "--help" is not the branch this checkout holds (${branch}); write the line "target: ${branch}"`,
    );
  });

  test('a target on a detached HEAD', () => {
    const fx = fixture();
    git(fx.top, 'checkout', '-q', '--detach');
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      "target: this checkout's HEAD is detached, so the worker would land on a branch it does not hold: check out the branch the worker lands in, or drop the target key",
    );
  });

  test('a rulings file in the main checkout, launched from a sibling', () => {
    const fx = fixture();
    const sib = sibling(fx, path.join(tmp(), 'sib'));
    const rulings = path.join(fx.docs, 'rulings.md');
    fs.writeFileSync(sib.brief, sib.text({ rulings }));
    const h = harness(fx, { cwd: sib.top, workTree: sib.top });
    const code = h.dispatch(sib.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      `rulings: ${rulings} is in the checkout ${fx.top}; it must be in the launching checkout ${sib.top}`,
    );
  });

  test('an excludes file it cannot write, before claude starts', () => {
    const fx = fixture();
    const exclude = path.join(fx.top, '.git', 'info', 'exclude');
    fs.chmodSync(exclude, 0o444);
    const h = harness(fx);
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expect(code).toBe(1);
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toStartWith(
      `cannot add .claude/worktrees/ to ${exclude}: `,
    );
    expect(h.claude.launches()).toEqual([]);
    expect(h.out).toEqual([]);
  });

  test('a profile GIT_CONFIG_COUNT that is not digits, among the other reasons', () => {
    const fx = fixture({
      description: 'W',
      settings: { env: { GIT_CONFIG_COUNT: 2 } },
    });
    fx.rewrite({ place: 'in-place' });
    const h = harness(fx);
    expect(h.dispatch(fx.brief)).toBe(1);
    expect(h.err).toEqual([
      'place: "in-place" is not "worktree"; dispatch starts a worker only in a worktree of its own',
      "--permission-mode is required: pass the orchestrating session's own mode, one of default, acceptEdits, plan, auto, dontAsk, bypassPermissions, manual",
      "the profile's GIT_CONFIG_COUNT is 2, not a string of digits",
    ]);
    expect(h.claude.launches()).toEqual([]);
  });

  test('with every reason it finds at once', () => {
    const fx = fixture();
    fx.rewrite({ place: 'in-place' });
    fs.writeFileSync(path.join(fx.top, 'a.txt'), 'changed\n');
    git(fx.top, 'branch', 'worktree-w1');
    const h = harness(fx);
    const code = h.dispatch(fx.brief);
    expect(code).toBe(1);
    expect(h.err).toHaveLength(4);
    expect(h.err.join('\n')).toContain('place:');
    expect(h.err.join('\n')).toContain('uncommitted changes');
    expect(h.err.join('\n')).toContain('worktree-w1 already exists');
    expect(h.err.join('\n')).toContain('--permission-mode is required');
  });
});

describe('dispatch launches', () => {
  test('claude with the profile, the mode, the worktree, and the prompt, in that order', () => {
    const fx = fixture();
    const h = harness(fx);
    expect(h.dispatch(fx.brief, '--permission-mode', 'acceptEdits')).toBe(0);
    const launch = onlyLaunch(h);
    expect(launch.args.slice(0, 3)).toEqual([
      '--add-dir',
      path.join(fx.store, 'worker'),
      '--settings',
    ]);
    expect(launch.args.slice(4)).toEqual([
      '--permission-mode',
      'acceptEdits',
      '--worktree',
      'w1',
      '--bg',
      '-n',
      'w1',
      '--',
      `/sidekick:sk-worker --dispatched ${fx.brief}`,
    ]);
    expect(launch.opts).toEqual({
      cwd: fx.top,
      timeoutMs: LAUNCH_TIMEOUT_MS,
    });
  });

  test('the profile --profile names, from the same store', () => {
    const fx = fixture();
    fs.mkdirSync(path.join(fx.store, 'other'));
    fs.writeFileSync(
      path.join(fx.store, 'other', 'profile.json'),
      JSON.stringify({ description: 'Other', settings: { model: 'sonnet' } }),
    );
    const h = harness(fx);
    const code = h.dispatch(
      fx.brief,
      '--permission-mode',
      'auto',
      '--profile',
      'other',
    );
    expect(code).toBe(0);
    const launch = onlyLaunch(h);
    expect(launch.args.slice(0, 2)).toEqual([
      '--add-dir',
      path.join(fx.store, 'other'),
    ]);
    expect(settingsOf(launch)).toMatchObject({
      model: 'sonnet',
      sidekick: { profile: 'other' },
    });
  });

  test('--plugin-dir, resolved against the current folder, before --permission-mode', () => {
    const fx = fixture();
    fs.mkdirSync(path.join(fx.top, 'plugin'));
    const h = harness(fx);
    const code = h.dispatch(
      fx.brief,
      '--permission-mode',
      'auto',
      '--plugin-dir',
      'plugin',
    );
    expect(code).toBe(0);
    expect(onlyLaunch(h).args.slice(4, 8)).toEqual([
      '--plugin-dir',
      path.join(fx.top, 'plugin'),
      '--permission-mode',
      'auto',
    ]);
  });

  test('the finish line quotes a brief path with a space', () => {
    const fx = fixture();
    const spaced = path.join(fx.docs, 'my brief.md');
    fs.copyFileSync(fx.brief, spaced);
    const h = harness(fx);
    expect(h.dispatch(spaced, '--permission-mode', 'auto')).toBe(0);
    expect(h.out).toContain(`finish: sidekick worker finish '${spaced}'`);
  });

  test('from the top when run in a subfolder, with a relative brief made absolute', () => {
    const fx = fixture();
    const h = harness(fx, { cwd: fx.docs });
    expect(h.dispatch('x-brief.md', '--permission-mode', 'auto')).toBe(0);
    const launch = onlyLaunch(h);
    expect(launch.opts.cwd).toBe(fx.top);
    expect(launch.args.at(-1)).toBe(
      `/sidekick:sk-worker --dispatched ${fx.brief}`,
    );
    const env = settingsOf(launch).env;
    expect(env).toMatchObject({ SIDEKICK_WORKER: fx.brief });
    expect(h.out).toContain(`finish: sidekick worker finish ${fx.brief}`);
  });

  test('with the overlay in its settings: the worktree base, the marker, and the push block', () => {
    const fx = fixture();
    const h = harness(fx);
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    expect(settingsOf(onlyLaunch(h))).toEqual({
      worktree: { baseRef: 'head' },
      env: {
        SIDEKICK_WORKER: fx.brief,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: PUSH_REWRITE_KEY,
        GIT_CONFIG_VALUE_0: '',
      },
      permissions: { deny: [PUSH_DENY_RULE], allow: allowRulesOf(fx) },
      sidekick: { profile: 'worker' },
    });
  });

  test('--allow-push drops the push block, the deny rule, and the pushurl refusal', () => {
    const fx = fixture();
    git(fx.top, 'remote', 'add', 'origin', '/nowhere/a');
    git(fx.top, 'config', 'remote.origin.pushurl', '/nowhere/b');
    const h = harness(fx);
    const code = h.dispatch(
      fx.brief,
      '--permission-mode',
      'auto',
      '--allow-push',
    );
    expect(code).toBe(0);
    expect(settingsOf(onlyLaunch(h))).toEqual({
      worktree: { baseRef: 'head' },
      env: { SIDEKICK_WORKER: fx.brief },
      permissions: { allow: allowRulesOf(fx) },
      sidekick: { profile: 'worker' },
    });
    expect(h.out).toContain(
      "worker w1 dispatched · permission mode auto · pushes ALLOWED on the operator's word",
    );
  });

  test('prints the exclude line, relays claude, then the summary', () => {
    const fx = fixture();
    const h = harness(fx);
    expect(h.dispatch(fx.brief, '--permission-mode', 'acceptEdits')).toBe(0);
    expect(h.out).toEqual([
      `added .claude/worktrees/ to ${path.join(fx.top, '.git', 'info', 'exclude')}`,
      'backgrounded · 213245a1 · w1',
      'worker w1 dispatched · permission mode acceptEdits · pushes blocked',
      `lands in: ${git(fx.top, 'symbolic-ref', '--short', 'HEAD')}`,
      `steer: rulings in ${path.join(fx.docs, 'rulings.md')}, then message "w1" to point at them`,
      `finish: sidekick worker finish ${fx.brief}`,
    ]);
  });

  test('says every tool call is pre-approved under bypassPermissions', () => {
    const fx = fixture();
    const h = harness(fx);
    expect(h.dispatch(fx.brief, '--permission-mode', 'bypassPermissions')).toBe(
      0,
    );
    expect(h.out.slice(-5, -3)).toEqual([
      'worker w1 dispatched · permission mode bypassPermissions · pushes blocked',
      'every tool call the worker makes is pre-approved',
    ]);
    expect(h.out.at(-3)).toStartWith('lands in: ');
  });

  test("returns claude's exit code, relaying its text, with no summary on a failure", () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.launch = ok({
      code: 3,
      stderr: 'trust this folder first\n',
    });
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(3);
    expect(h.err).toEqual(['trust this folder first']);
    expect(h.out.some((l) => l.startsWith('worker w1 dispatched'))).toBe(false);
  });

  test('prints the profile check warnings on stderr before the launch', () => {
    const fx = fixture();
    const h = harness(fx, {
      env: {
        SIDEKICK_PROFILES_DIR: fx.store,
        SIDEKICK_PROFILE_SKIP_CHECK: '1',
      },
    });
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    expect(h.err).toEqual([
      'SIDEKICK_PROFILE_SKIP_CHECK=1 is set, so the settings were not checked with claude doctor.',
    ]);
  });
});

describe('dispatch from another checkout', () => {
  const allowRulesIn = (call: Call): unknown => {
    const permissions = settingsOf(call).permissions;
    return typeof permissions === 'object' && permissions !== null
      ? Reflect.get(permissions, 'allow')
      : undefined;
  };

  test.each([
    ['a sibling worktree', (_fx: Fixture) => path.join(tmp(), 'sib')],
    [
      'a nested worktree',
      (fx: Fixture) => path.join(fx.top, '.claude', 'worktrees', 'x'),
    ],
  ])('from %s: launches there, checks its HEAD, names the target', (_l, where) => {
    const fx = fixture();
    const sib = sibling(fx, where(fx));
    git(sib.top, 'commit', '-q', '--allow-empty', '-m', 'sib work');
    const sibHead = git(sib.top, 'rev-parse', 'HEAD');
    fs.writeFileSync(sib.brief, sib.text({ baseline: sibHead }));
    const h = harness(fx, { cwd: sib.top, workTree: sib.top });
    expect(h.dispatch(sib.brief, '--permission-mode', 'auto')).toBe(0);
    const launch = onlyLaunch(h);
    expect(launch.opts.cwd).toBe(sib.top);
    expect(h.out).toContain(`lands in: sib · launched from ${sib.top}`);
    expect(allowRulesIn(launch)).toEqual([
      `Read(/${sib.brief})`,
      `Read(/${fx.fields.plan})`,
      `Read(/${fx.fields.spec})`,
      `Read(/${path.join(sib.top, 'docs', 'rulings.md')})`,
      SAVE_SKILL_RULE,
    ]);
    const record = path.join(fx.top, '.git', 'sidekick', 'workers', 'w1.json');
    expect(JSON.parse(fs.readFileSync(record, 'utf-8')).version).toBe(2);
  });

  test('refuses a baseline that is the main checkout HEAD, not the sibling HEAD', () => {
    const fx = fixture();
    const sib = sibling(fx, path.join(tmp(), 'sib'));
    git(sib.top, 'commit', '-q', '--allow-empty', '-m', 'sib work');
    const sibHead = git(sib.top, 'rev-parse', 'HEAD');
    const h = harness(fx, { cwd: sib.top, workTree: sib.top });
    const code = h.dispatch(sib.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      `baseline: ${fx.head} does not resolve to this checkout's HEAD (${sibHead})`,
    );
  });

  test('checks the name clashes against the main checkout', () => {
    const fx = fixture();
    const sib = sibling(fx, path.join(tmp(), 'sib'));
    const folder = path.join(fx.top, '.claude', 'worktrees', 'w1');
    fs.mkdirSync(folder, { recursive: true });
    git(fx.top, 'branch', 'worktree-w1');
    const h = harness(fx, { cwd: sib.top, workTree: sib.top });
    const code = h.dispatch(sib.brief, '--permission-mode', 'auto');
    expect(code).toBe(1);
    expect(h.err).toContain(`name: ${folder} already exists`);
    expect(h.err).toContain(
      'name: the branch worktree-w1 already exists: once you have checked that its commits have landed, delete it with git branch -D worktree-w1, or dispatch under another name',
    );
  });

  test('accepts target: <branch> when a tag shares the branch name', () => {
    const fx = fixture();
    const branch = fx.fields.target;
    git(fx.top, 'tag', branch);
    const h = harness(fx);
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    expect(h.err).toEqual([]);
    expect(h.out).toContain(`lands in: ${branch}`);
  });

  test('the main checkout gets the four read rules and the Skill rule too, and no launched-from text', () => {
    const fx = fixture();
    const h = harness(fx);
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    expect(allowRulesIn(onlyLaunch(h))).toEqual(allowRulesOf(fx));
    expect(h.out.some((l) => l.includes('launched from'))).toBe(false);
  });

  test('a detached HEAD with no target lands where the operator lands it', () => {
    const fx = fixture();
    git(fx.top, 'checkout', '-q', '--detach');
    const { target: _target, ...rest } = fx.fields;
    fs.writeFileSync(fx.brief, briefText(rest));
    const h = harness(fx);
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    expect(h.out).toContain(
      "lands in: where the operator lands it (this checkout's HEAD is detached)",
    );
  });
});

describe('dispatch records the worker', () => {
  const recordFile = (fx: Fixture): string =>
    path.join(fx.top, '.git', 'sidekick', 'workers', 'w1.json');

  test('after a start: the job id, the absolute brief, and an ISO time', () => {
    const fx = fixture();
    const h = harness(fx);
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    const saved = JSON.parse(fs.readFileSync(recordFile(fx), 'utf-8'));
    expect(saved).toEqual({
      version: 2,
      name: 'w1',
      main: null,
      job: '213245a1',
      brief: fx.brief,
      dispatchedAt: saved.dispatchedAt,
    });
    expect(new Date(saved.dispatchedAt).toISOString()).toBe(saved.dispatchedAt);
  });

  test('with a null job when the output names no job', () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.launch = ok({ stdout: 'started\n' });
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    expect(JSON.parse(fs.readFileSync(recordFile(fx), 'utf-8')).job).toBeNull();
  });

  test('taking the id from the bare `backgrounded <id>` form', () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.launch = ok({ stdout: 'backgrounded 99887766\n' });
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    expect(JSON.parse(fs.readFileSync(recordFile(fx), 'utf-8')).job).toBe(
      '99887766',
    );
  });

  test('not after a failed start', () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.launch = ok({ code: 3, stderr: 'no\n' });
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(3);
    expect(fs.existsSync(recordFile(fx))).toBe(false);
  });

  test('warning, not failing, when the record cannot be written', () => {
    const fx = fixture();
    fs.writeFileSync(path.join(fx.top, '.git', 'sidekick'), 'a file');
    const h = harness(fx);
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toContain(recordFile(fx));
  });
});

describe('dispatch records the main', () => {
  const SESSION = '0123456789abcdef';

  // A config folder whose sessions file names SESSION with this name source.
  function configWith(nameSource: string): string {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'sessions'));
    fs.writeFileSync(
      path.join(dir, 'sessions', '1.json'),
      JSON.stringify({ sessionId: SESSION, nameSource }),
    );
    return dir;
  }

  function inSession(
    fx: Fixture,
    env: Record<string, string>,
    nameSource = 'user',
  ) {
    const h = harness(fx, {
      env: {
        SIDEKICK_PROFILES_DIR: fx.store,
        CLAUDE_CONFIG_DIR: configWith(nameSource),
        ...env,
      },
    });
    h.claude.state.agents = JSON.stringify([
      { name: 'Single word reply', sessionId: SESSION },
    ]);
    return h;
  }

  const run = (h: Harness, fx: Fixture) =>
    h.dispatch(fx.brief, '--permission-mode', 'default');

  test('the listed name goes whole into the settings and the main line, before the summary', () => {
    const fx = fixture();
    const h = inSession(fx, { CLAUDE_CODE_SESSION_ID: SESSION });
    expect(run(h, fx)).toBe(0);
    const env = settingsOf(onlyLaunch(h)).env;
    expect(env).toMatchObject({ SIDEKICK_MAIN: 'Single word reply' });
    const at = h.out.indexOf('main: Single word reply');
    expect(at).toBeGreaterThan(-1);
    expect(h.out[at + 1]).toStartWith('worker w1 dispatched');
  });

  test('an automatic name carries the not-held suffix', () => {
    const fx = fixture();
    const h = inSession(fx, { CLAUDE_CODE_SESSION_ID: SESSION }, 'derived');
    run(h, fx);
    expect(h.out).toContain(
      'main: Single word reply · sidekick holds this name once this session is idle; ← before then loses it',
    );
  });

  test('an inherited SIDEKICK_MAIN is the root main, with no suffix', () => {
    const fx = fixture();
    const h = inSession(
      fx,
      { CLAUDE_CODE_SESSION_ID: SESSION, SIDEKICK_MAIN: 'root main' },
      'derived',
    );
    run(h, fx);
    expect(settingsOf(onlyLaunch(h)).env).toMatchObject({
      SIDEKICK_MAIN: 'root main',
    });
    expect(h.out).toContain('main: root main');
  });

  test('a session missing from the listing records its id prefix', () => {
    const fx = fixture();
    const h = inSession(fx, { CLAUDE_CODE_SESSION_ID: SESSION });
    h.claude.state.agents = '[]';
    run(h, fx);
    expect(settingsOf(onlyLaunch(h)).env).toMatchObject({
      SIDEKICK_MAIN: '01234567',
    });
  });

  test('outside a session it records nothing and prints no main line', () => {
    const fx = fixture();
    const h = harness(fx);
    run(h, fx);
    expect(settingsOf(onlyLaunch(h)).env).not.toHaveProperty('SIDEKICK_MAIN');
    expect(h.out.some((line) => line.startsWith('main:'))).toBe(false);
  });

  test('the record names the main the worker was given', () => {
    const fx = fixture();
    const h = inSession(fx, { CLAUDE_CODE_SESSION_ID: SESSION });
    run(h, fx);
    const file = path.join(fx.top, '.git', 'sidekick', 'workers', 'w1.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).main).toBe(
      'Single word reply',
    );
  });

  test('a failed start prints no main line', () => {
    const fx = fixture();
    const h = inSession(fx, { CLAUDE_CODE_SESSION_ID: SESSION });
    h.claude.state.launch = ok({ code: 2, stderr: 'boom\n' });
    run(h, fx);
    expect(h.out.some((line) => line.startsWith('main:'))).toBe(false);
  });

  test('lists the sessions once before the launch, and once after it for the worktree check', () => {
    const fx = fixture();
    const h = inSession(fx, { CLAUDE_CODE_SESSION_ID: SESSION });
    run(h, fx);
    const kinds = h.claude.calls
      .filter((c) => c.args[0] === 'agents' || c.args.includes('--bg'))
      .map((c) => c.args[0]);
    expect(kinds).toEqual(['agents', '--add-dir', 'agents']);
  });
});

describe("dispatch checks the worker's worktree after the launch", () => {
  const recordFile = (fx: Fixture): string =>
    path.join(fx.top, '.git', 'sidekick', 'workers', 'w1.json');

  const dispatched = (h: Harness): boolean =>
    h.out.some((line) => line.startsWith('worker w1 dispatched'));

  test('a hook-made worktree: stops the job, keeps the record, prints no summary, and exits 1', () => {
    const fx = fixture();
    const h = harness(fx);
    // worktrunk's shape: `../<repo>.<name>` on the branch `<name>`.
    const hooked = path.join(tmp(), `${path.basename(fx.top)}.w1`);
    h.claude.state.land = (launchCwd, name) => {
      git(launchCwd, 'worktree', 'add', '-q', hooked, '-b', name);
      return hooked;
    };
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(1);
    expect(h.claude.stops()).toEqual([
      { args: ['stop', JOB], opts: { cwd: fx.top, timeoutMs: 10_000 } },
    ]);
    expect(JSON.parse(fs.readFileSync(recordFile(fx), 'utf-8')).job).toBe(JOB);
    expect(dispatched(h)).toBe(false);
    expect(h.out).toContain(`backgrounded · ${JOB} · w1`);
    const native = path.join(fx.top, '.claude', 'worktrees', 'w1');
    expect(h.err).toEqual([
      `the worker's worktree is ${hooked} on w1, not ${native} on worktree-w1: a WorktreeCreate hook likely made it`,
      `dispatch stopped the worker with claude stop ${JOB}. Remove its worktree with the hook's own removal, then run: sidekick worker finish ${fx.brief} --discard`,
    ]);
  });

  test('from a linked worktree, a worktree under that checkout is refused, and stopped from it', () => {
    const fx = fixture();
    const sib = sibling(fx, path.join(tmp(), 'sib'));
    const h = harness(fx, { cwd: sib.top, workTree: sib.top });
    const underSib = path.join(sib.top, '.claude', 'worktrees', 'w1');
    h.claude.state.land = (launchCwd, name) => {
      git(
        launchCwd,
        'worktree',
        'add',
        '-q',
        underSib,
        '-b',
        `worktree-${name}`,
      );
      return underSib;
    };
    expect(h.dispatch(sib.brief, '--permission-mode', 'auto')).toBe(1);
    const native = path.join(fx.top, '.claude', 'worktrees', 'w1');
    expect(h.err[0]).toBe(
      `the worker's worktree is ${underSib} on worktree-w1, not ${native} on worktree-w1: a WorktreeCreate hook likely made it`,
    );
    expect(h.claude.stops().map((c) => c.opts.cwd)).toEqual([sib.top]);
  });

  test('a worktree off the baseline: the way out drops the hook, and quotes the brief path', () => {
    const fx = fixture();
    const spaced = path.join(fx.docs, 'my brief.md');
    fs.copyFileSync(fx.brief, spaced);
    const h = harness(fx);
    const other = offBaseline(fx);
    h.claude.state.land = offBaselineLanding(fx, other);
    expect(h.dispatch(spaced, '--permission-mode', 'auto')).toBe(1);
    expect(h.err).toEqual([
      `the worker's worktree was created at ${other}, not the baseline ${fx.head}: worktree.baseRef is likely not "head" for this launch`,
      `dispatch stopped the worker with claude stop ${JOB}. Then run: sidekick worker finish '${spaced}' --discard`,
    ]);
  });

  test('a stop that fails says so, and the way out starts with the stop', () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.land = offBaselineLanding(fx, offBaseline(fx));
    h.claude.state.stop = ok({ code: 4, stderr: 'no such job\n' });
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(1);
    expect(h.err.slice(1)).toEqual([
      `claude stop ${JOB} failed with exit code 4, so the worker may still run:`,
      'no such job',
      `Stop the worker with claude stop ${JOB}. Then run: sidekick worker finish ${fx.brief} --discard`,
    ]);
    expect(fs.existsSync(recordFile(fx))).toBe(true);
  });

  test('a check that cannot find the job: the summary, the record, its line, and exit 0', () => {
    const fx = fixture();
    const sleeps: number[] = [];
    const h = harness(fx, { sleep: (ms) => sleeps.push(ms) });
    h.claude.state.land = () => undefined;
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    expect(dispatched(h)).toBe(true);
    expect(h.err).toEqual([
      `the worktree check did not run: after 5 tries, claude agents --json --all lists no job ${JOB}`,
    ]);
    expect(sleeps).toEqual([1000, 1000, 1000, 1000]);
    expect(h.claude.stops()).toEqual([]);
    expect(JSON.parse(fs.readFileSync(recordFile(fx), 'utf-8')).job).toBe(JOB);
  });

  test('a launch that names no job: its line, the record with no job, and exit 0', () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.launch = ok({ stdout: 'started\n' });
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    expect(dispatched(h)).toBe(true);
    expect(h.err).toEqual([
      "the worktree check did not run: claude's output named no job id for w1",
    ]);
    expect(JSON.parse(fs.readFileSync(recordFile(fx), 'utf-8')).job).toBeNull();
  });

  test('the record is written before the check reads the listing', () => {
    const fx = fixture();
    const recordAtCheck: boolean[] = [];
    const h = harness(fx, {
      runClaude: (args, opts) => {
        const afterLaunch = h.claude.launches().length > 0;
        if (args[0] === 'agents' && afterLaunch) {
          recordAtCheck.push(fs.existsSync(recordFile(fx)));
        }
        return h.claude.run(args, opts);
      },
    });
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    expect(recordAtCheck).toEqual([true]);
  });
});

describe('dispatch --check', () => {
  const refusals = (h: Harness): string => h.err.join('\n');

  test('a pass prints the one line and launches nothing', () => {
    const fx = fixture();
    const h = harness(fx);
    const branch = git(fx.top, 'symbolic-ref', '--short', 'HEAD');
    expect(h.dispatch('--check', '--permission-mode', 'auto')).toBe(0);
    expect(h.out).toEqual([
      `dispatch can run here: ${branch}, profile worker, mode auto`,
    ]);
    expect(h.err).toEqual([]);
    expect(h.claude.launches()).toEqual([]);
  });

  test('names a detached HEAD by its short commit', () => {
    const fx = fixture();
    git(fx.top, 'checkout', '-q', '--detach');
    const h = harness(fx);
    expect(h.dispatch('--check', '--permission-mode', 'auto')).toBe(0);
    expect(h.out).toEqual([
      `dispatch can run here: detached HEAD at ${fx.head.slice(0, 7)}, profile worker, mode auto`,
    ]);
  });

  test('reports every reason at once: a dirty tracked file and a missing mode', () => {
    const fx = fixture();
    fs.writeFileSync(path.join(fx.top, 'a.txt'), 'changed\n');
    const h = harness(fx);
    expect(h.dispatch('--check')).toBe(1);
    expect(h.err).toHaveLength(2);
    expect(refusals(h)).toContain('uncommitted changes');
    expect(refusals(h)).toContain('--permission-mode is required');
    expect(h.out).toEqual([]);
  });

  test('refuses inside a worker', () => {
    const fx = fixture();
    const h = harness(fx, {
      env: { SIDEKICK_PROFILES_DIR: fx.store, SIDEKICK_WORKER: '/x/brief.md' },
    });
    expect(h.dispatch('--check', '--permission-mode', 'auto')).toBe(1);
    expect(h.err).toEqual([
      'SIDEKICK_WORKER is set: a worker cannot dispatch workers of its own (#255)',
    ]);
    expect(h.claude.calls).toEqual([]);
  });

  test('refuses a checkout whose HEAD has no commit yet', () => {
    const fx = fixture();
    const empty = tmp();
    git(empty, 'init', '-q');
    const h = harness(fx, { cwd: empty, workTree: empty });
    expect(h.dispatch('--check', '--permission-mode', 'auto')).toBe(1);
    expect(refusals(h)).toContain("this checkout's HEAD has no commit yet");
    expect(h.out).toEqual([]);
  });

  test('refuses a folder outside any work tree', () => {
    const fx = fixture();
    const outside = tmp();
    const h = harness(fx, { cwd: outside, workTree: outside });
    expect(h.dispatch('--check', '--permission-mode', 'auto')).toBe(1);
    expect(h.err).toContain(
      'not inside a git work tree: run sidekick worker from a checkout of the repo',
    );
    expect(h.out).toEqual([]);
  });

  test('passes where the brief has no ## Limits, since it takes no brief', () => {
    const fx = fixture();
    fs.writeFileSync(fx.brief, briefText(fx.fields, 'Gates.\n'));
    const h = harness(fx);
    expect(h.dispatch('--check', '--permission-mode', 'auto')).toBe(0);
    expect(h.err).toEqual([]);
  });

  test('refuses a brief, naming it', () => {
    const fx = fixture();
    const h = harness(fx);
    const code = h.dispatch('--check', fx.brief, '--permission-mode', 'auto');
    expect(code).toBe(1);
    expect(h.err).toEqual(['--check takes no brief']);
    expect(h.out).toEqual([]);
    expect(h.claude.calls).toEqual([]);
  });

  test('refuses a pushurl remote, and --allow-push skips that check', () => {
    const fx = fixture();
    git(fx.top, 'remote', 'add', 'origin', '/nowhere/a');
    git(fx.top, 'config', 'remote.origin.pushurl', '/nowhere/b');
    const h = harness(fx);
    expect(h.dispatch('--check', '--permission-mode', 'auto')).toBe(1);
    expect(refusals(h)).toContain('remote "origin" sets pushurl');
    const allowed = harness(fx);
    const code = allowed.dispatch(
      '--check',
      '--permission-mode',
      'auto',
      '--allow-push',
    );
    expect(code).toBe(0);
    expect(allowed.err).toEqual([]);
  });

  test('refuses an unknown mode, a missing plugin folder, and bypass without the user source', () => {
    const fx = fixture({ description: 'Worker', settingSources: ['project'] });
    const missing = path.join(fx.top, 'nope');
    const h = harness(fx);
    const code = h.dispatch(
      '--check',
      '--permission-mode',
      'bypassPermissions',
      '--plugin-dir',
      missing,
    );
    expect(code).toBe(1);
    expect(refusals(h)).toContain(`--plugin-dir: ${missing} is not a folder`);
    expect(refusals(h)).toContain(
      'bypassPermissions needs the user setting source',
    );
    const bad = harness(fx);
    expect(bad.dispatch('--check', '--permission-mode', 'nope')).toBe(1);
    expect(refusals(bad)).toContain('is not one of');
  });

  test('refuses a missing profile with the hint to create it', () => {
    const fx = fixture();
    const h = harness(fx);
    const code = h.dispatch(
      '--check',
      '--permission-mode',
      'auto',
      '--profile',
      'ghost',
    );
    expect(code).toBe(1);
    expect(refusals(h)).toContain(
      'sidekick profile new ghost --description <text>',
    );
  });

  test('runs none of the brief checks and lists no sessions', () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.agents = JSON.stringify([
      { id: 'abc', kind: 'background', name: 'w1' },
    ]);
    git(fx.top, 'branch', 'worktree-w1');
    expect(h.dispatch('--check', '--permission-mode', 'auto')).toBe(0);
    expect(h.claude.calls.some((c) => c.args[0] === 'agents')).toBe(false);
  });

  test('prints the profile notes on stderr, then the pass line', () => {
    const fx = fixture();
    const h = harness(fx, {
      env: {
        SIDEKICK_PROFILES_DIR: fx.store,
        SIDEKICK_PROFILE_SKIP_CHECK: '1',
      },
    });
    expect(h.dispatch('--check', '--permission-mode', 'auto')).toBe(0);
    expect(h.err).toEqual([
      'SIDEKICK_PROFILE_SKIP_CHECK=1 is set, so the settings were not checked with claude doctor.',
    ]);
    expect(h.out).toHaveLength(1);
  });

  test('composes the overlay with a placeholder brief path in the checkout and no Read rules', () => {
    const fx = fixture();
    const seen: Record<string, unknown>[] = [];
    const inner = fakeClaude(fx.top);
    const h = harness(fx, {
      runClaude: (args, opts) => {
        const i = args.indexOf('--settings');
        if (i >= 0 && fs.existsSync(args[i + 1])) {
          seen.push(JSON.parse(fs.readFileSync(args[i + 1], 'utf-8')));
        }
        return inner.run(args, opts);
      },
    });
    expect(h.dispatch('--check', '--permission-mode', 'auto')).toBe(0);
    const overlay = seen.find((s) => 'env' in s);
    expect(overlay).toBeDefined();
    const marker = (overlay?.env as Record<string, string>).SIDEKICK_WORKER;
    expect(path.dirname(marker)).toBe(fs.realpathSync(fx.top));
    expect(JSON.stringify(overlay)).not.toContain('Read(');
  });
});
