import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import { LAUNCH_TIMEOUT_MS } from './profile.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import { runWorkerCli, type WorkerEnv } from './worker.js';
import { PUSH_DENY_RULE, PUSH_REWRITE_KEY } from './worker-overlay.js';

afterEach(removeTemps);

const briefText = (fields: Record<string, string>): string =>
  `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n\nGates at the baseline: all pass.\n`;

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
  };
  const brief = path.join(docs, 'x-brief.md');
  const rewrite = (over: Record<string, string>): void =>
    fs.writeFileSync(brief, briefText({ ...fields, ...over }));
  rewrite({});
  return { top, docs, head, store, brief, rewrite };
}

type Fixture = ReturnType<typeof fixture>;

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

/**
 * Plays `doctor` with the canary's line, `plugin list --json`, and the agents
 * listing from `state.agents`; any other call is the launch.
 */
function fakeClaude() {
  const calls: Call[] = [];
  const state = {
    agents: '[]',
    launch: ok({ stdout: 'backgrounded · 213245a1 · w1\n' }),
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
    if (args[0] === 'agents') return ok({ stdout: state.agents });
    return state.launch;
  };
  const launches = (): Call[] => calls.filter((c) => c.args.includes('--bg'));
  return { run, calls, state, launches };
}

function harness(fx: Fixture, over: Partial<WorkerEnv> = {}) {
  const claude = fakeClaude();
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
      `baseline: ${fx.head} does not resolve to the main checkout's HEAD (${head})`,
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
    expectRefused(h, code, 'name: the branch worktree-w1 already exists');
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

  test('a run from a linked worktree, naming the main checkout', () => {
    const fx = fixture();
    const linked = path.join(tmp(), 'wt');
    git(fx.top, 'worktree', 'add', '-q', linked);
    const h = harness(fx, { cwd: linked, workTree: linked });
    const code = h.dispatch(fx.brief, '--permission-mode', 'auto');
    expectRefused(
      h,
      code,
      `${linked} is a linked worktree: run sidekick worker from the main checkout, whose git dir is ${path.join(fx.top, '.git')}`,
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
      `/sidekick:sk-worker ${fx.brief}`,
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

  test('from the top when run in a subfolder, with a relative brief made absolute', () => {
    const fx = fixture();
    const h = harness(fx, { cwd: fx.docs });
    expect(h.dispatch('x-brief.md', '--permission-mode', 'auto')).toBe(0);
    const launch = onlyLaunch(h);
    expect(launch.opts.cwd).toBe(fx.top);
    expect(launch.args.at(-1)).toBe(`/sidekick:sk-worker ${fx.brief}`);
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
      permissions: { deny: [PUSH_DENY_RULE] },
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
    expect(h.out.slice(-4, -2)).toEqual([
      'worker w1 dispatched · permission mode bypassPermissions · pushes blocked',
      'every tool call the worker makes is pre-approved',
    ]);
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

describe('dispatch records the worker', () => {
  const recordFile = (fx: Fixture): string =>
    path.join(fx.top, '.git', 'sidekick', 'workers', 'w1.json');

  test('after a start: the job id, the absolute brief, and an ISO time', () => {
    const fx = fixture();
    const h = harness(fx);
    expect(h.dispatch(fx.brief, '--permission-mode', 'auto')).toBe(0);
    const saved = JSON.parse(fs.readFileSync(recordFile(fx), 'utf-8'));
    expect(saved).toEqual({
      version: 1,
      name: 'w1',
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
      'main: Single word reply · sidekick holds this name when this turn ends; ← before then loses it',
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

  test('a failed start prints no main line', () => {
    const fx = fixture();
    const h = inSession(fx, { CLAUDE_CODE_SESSION_ID: SESSION });
    h.claude.state.launch = ok({ code: 2, stderr: 'boom\n' });
    run(h, fx);
    expect(h.out.some((line) => line.startsWith('main:'))).toBe(false);
  });

  test('lists the sessions once', () => {
    const fx = fixture();
    const h = inSession(fx, { CLAUDE_CODE_SESSION_ID: SESSION });
    run(h, fx);
    expect(h.claude.calls.filter((c) => c.args[0] === 'agents')).toHaveLength(
      1,
    );
  });
});
