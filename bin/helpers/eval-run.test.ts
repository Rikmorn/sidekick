import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ClaudeRunner, ShellRunner } from './eval-run.js';
import {
  buildAgentArgv,
  buildJudgePrompt,
  buildSkillArgv,
  evaluateJudge,
  evaluateStructured,
  getByPath,
  parseEnvelope,
  runEvalSuite,
} from './eval-run.js';

/** A JSON envelope matching the real `claude -p --output-format json` shape (Wave 1). */
function fakeEnvelope(
  resultText: string,
  opts: {
    cost?: number;
    turns?: number;
    model?: string;
    isError?: boolean;
    subtype?: string;
  } = {},
): string {
  return JSON.stringify({
    type: 'result',
    subtype: opts.subtype ?? 'success',
    is_error: opts.isError ?? false,
    api_error_status: null,
    duration_ms: 1234,
    num_turns: opts.turns ?? 2,
    result: resultText,
    total_cost_usd: opts.cost ?? 0.1,
    session_id: 'sess-1',
    modelUsage: { [opts.model ?? 'claude-opus-4-8[1m]']: { costUSD: 0.1 } },
    permission_denials: [],
    terminal_reason: 'completed',
  });
}

const deliverableText = (obj: unknown) =>
  `reasoning prose\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;

describe('argv builders', () => {
  it('builds an agent dispatch argv', () => {
    expect(
      buildAgentArgv('sk-coherence-checker', 'PROMPT', { maxTurns: 25 }),
    ).toEqual([
      '-p',
      '--agent',
      'sk-coherence-checker',
      'PROMPT',
      '--output-format',
      'json',
      '--max-turns',
      '25',
    ]);
  });

  it('passes --model through when given', () => {
    expect(
      buildAgentArgv('a', 'p', { maxTurns: 5, model: 'claude-sonnet-5' }),
    ).toContain('claude-sonnet-5');
  });

  it('builds a skill invocation argv without --agent', () => {
    const argv = buildSkillArgv('/sk-design foo', { maxTurns: 10 });
    expect(argv).toEqual([
      '-p',
      '/sk-design foo',
      '--output-format',
      'json',
      '--max-turns',
      '10',
    ]);
    expect(argv).not.toContain('--agent');
  });
});

describe('parseEnvelope', () => {
  it('extracts result, cost, turns, and model-from-modelUsage-key', () => {
    const env = parseEnvelope(
      fakeEnvelope('hi', {
        cost: 0.25,
        turns: 3,
        model: 'claude-opus-4-8[1m]',
      }),
    );
    expect(env.ok).toBe(true);
    expect(env.result).toBe('hi');
    expect(env.cost_usd).toBe(0.25);
    expect(env.num_turns).toBe(3);
    expect(env.model).toBe('claude-opus-4-8[1m]');
    expect(env.error).toBe(null);
  });

  it('flags is_error envelopes', () => {
    const env = parseEnvelope(fakeEnvelope('x', { isError: true }));
    expect(env.ok).toBe(false);
    expect(env.error).toMatch(/error/);
  });

  it('flags a non-success subtype', () => {
    const env = parseEnvelope(
      fakeEnvelope('x', { subtype: 'error_max_turns' }),
    );
    expect(env.ok).toBe(false);
    expect(env.error).toMatch(/error_max_turns/);
  });

  it('flags unparseable stdout', () => {
    const env = parseEnvelope('not json');
    expect(env.ok).toBe(false);
    expect(env.error).toMatch(/unparseable/);
  });
});

describe('getByPath', () => {
  it('resolves a dotted path', () => {
    expect(getByPath({ a: { b: 'x' } }, 'a.b')).toBe('x');
  });
  it('returns undefined for a missing path', () => {
    expect(getByPath({ a: {} }, 'a.b.c')).toBeUndefined();
  });
});

describe('evaluateStructured', () => {
  const d = { verdict: 'fail', issues: [{ kind: 'x' }] };
  it('equals — pass on match', () => {
    expect(
      evaluateStructured(d, {
        type: 'structured',
        target: 'artifact',
        path: 'verdict',
        op: 'equals',
        value: 'fail',
      }).outcome,
    ).toBe('pass');
  });
  it('equals — fail on mismatch', () => {
    expect(
      evaluateStructured(d, {
        type: 'structured',
        target: 'artifact',
        path: 'verdict',
        op: 'equals',
        value: 'pass',
      }).outcome,
    ).toBe('fail');
  });
  it('exists — pass when present', () => {
    expect(
      evaluateStructured(d, {
        type: 'structured',
        target: 'artifact',
        path: 'issues',
        op: 'exists',
      }).outcome,
    ).toBe('pass');
  });
  it('matches — regex over stringified value', () => {
    expect(
      evaluateStructured(d, {
        type: 'structured',
        target: 'artifact',
        path: 'verdict',
        op: 'matches',
        value: '^fa',
      }).outcome,
    ).toBe('pass');
  });
});

describe('buildJudgePrompt — sealing', () => {
  it('contains only the rubric and artifact content', () => {
    const p = buildJudgePrompt('RUBRIC-TEXT', 'ARTIFACT-TEXT');
    expect(p).toContain('RUBRIC-TEXT');
    expect(p).toContain('ARTIFACT-TEXT');
    expect(p).toMatch(/verdict/);
    // Sealed: the function signature only accepts rubric + content, so there is
    // structurally no channel for the producer's identity/prompt/reasoning.
    expect(p).not.toMatch(/sk-[a-z]+-(checker|drafter|reviewer)/);
  });
});

describe('evaluateJudge', () => {
  const judge = {
    type: 'judge' as const,
    target: 'artifact' as const,
    rubric: 'is it good?',
    n: 3,
    threshold: 0.66,
  };
  const judgeRunner = (verdicts: string[]): ClaudeRunner => {
    let i = 0;
    return () => ({
      stdout: fakeEnvelope(deliverableText({ verdict: verdicts[i++] })),
      exitCode: 0,
    });
  };

  it('passes when the pass-rate meets threshold', () => {
    const r = evaluateJudge('artifact', judge, {
      claude: judgeRunner(['pass', 'pass', 'fail']),
      cwd: '/tmp',
    });
    expect(r.outcome).toBe('pass'); // 2/3 ≥ 0.66
  });

  it('fails when the pass-rate is below threshold', () => {
    const r = evaluateJudge('artifact', judge, {
      claude: judgeRunner(['pass', 'fail', 'fail']),
      cwd: '/tmp',
    });
    expect(r.outcome).toBe('fail'); // 1/3 < 0.66
  });

  it('excludes unknowns from the denominator', () => {
    // verdicts pass/unknown/pass → denom = 2 (unknown excluded), rate 2/2 = 1.0
    const r = evaluateJudge('artifact', judge, {
      claude: judgeRunner(['pass', 'unknown', 'pass']),
      cwd: '/tmp',
    });
    expect(r.outcome).toBe('pass');
    expect(r.detail).toMatch(/2\/2/);
  });

  it('errors when every run is unknown', () => {
    const r = evaluateJudge('artifact', judge, {
      claude: judgeRunner(['unknown', 'unknown', 'unknown']),
      cwd: '/tmp',
    });
    expect(r.outcome).toBe('error');
  });
});

describe('runEvalSuite (injected runner)', () => {
  let repoRoot: string;
  let argvLog: string[][];
  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-evalrun-'));
    argvLog = [];
    // A fixture with an RFC.
    const fixtureDir = path.join(repoRoot, 'evals', 'fixtures', 'f');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, 'RFC.md'), '# rfc\n');
  });
  afterEach(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const writeCase = (id: string, obj: unknown) => {
    const dir = path.join(repoRoot, 'evals', 'cases', 's1', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'case.json'), JSON.stringify(obj));
  };

  const agentCase = (verdict: string) => ({
    schemaVersion: 1,
    subject: { kind: 'agent', name: 'sk-coherence-checker' },
    fixture: 'evals/fixtures/f',
    prompt: 'artifact_path: {{WORKSPACE}}/RFC.md, artifact_type: rfc',
    assertions: [
      { type: 'structured', path: 'verdict', op: 'equals', value: verdict },
    ],
  });

  const claudeOk =
    (deliverable: unknown): ClaudeRunner =>
    (argv, _cwd) => {
      argvLog.push(argv);
      return {
        stdout: fakeEnvelope(deliverableText(deliverable)),
        exitCode: 0,
      };
    };
  const shell: ShellRunner = (cmd, cwd) => {
    // deterministic: `test -f RFC.md` in the workspace
    const ok = fs.existsSync(path.join(cwd, cmd.replace(/^test -f /, '')));
    return { exitCode: ok ? 0 : 1, stdout: '', stderr: '' };
  };

  const readRecords = (runId: string) =>
    fs
      .readFileSync(
        path.join(repoRoot, 'evals', 'results', runId, 'records.jsonl'),
        'utf-8',
      )
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

  it('writes one record per run with the expected shape and passing assertion', () => {
    writeCase('c1', agentCase('pass'));
    const res = runEvalSuite({
      repoRoot,
      suiteOrCasePath: 's1',
      runId: 'r1',
      deps: { claude: claudeOk({ verdict: 'pass' }), shell },
    });
    expect(res.exitCode).toBe(0);
    const records = readRecords('r1');
    expect(records.length).toBe(1);
    const rec = records[0];
    expect(rec.case_id).toBe('c1');
    expect(rec.suite).toBe('s1');
    expect(rec.status).toBe('ok');
    expect(rec.model).toBe('claude-opus-4-8[1m]');
    expect(rec.cost_usd).toBe(0.1);
    expect(rec.deliverable).toEqual({ verdict: 'pass' });
    expect(rec.assertions[0].outcome).toBe('pass');
    expect(rec.invocation_error).toBe(null);
    // the prompt's {{WORKSPACE}} was substituted with a real tmpdir path
    const dispatched = argvLog[0].join(' ');
    expect(dispatched).not.toContain('{{WORKSPACE}}');
    expect(dispatched).toContain('/RFC.md');
  });

  it('records a failing structured assertion', () => {
    writeCase('c1', agentCase('fail'));
    runEvalSuite({
      repoRoot,
      suiteOrCasePath: 's1',
      runId: 'r2',
      deps: { claude: claudeOk({ verdict: 'pass' }), shell },
    });
    expect(readRecords('r2')[0].assertions[0].outcome).toBe('fail');
  });

  it('honours --k by writing k records', () => {
    writeCase('c1', agentCase('pass'));
    runEvalSuite({
      repoRoot,
      suiteOrCasePath: 's1',
      runId: 'r3',
      k: 3,
      deps: { claude: claudeOk({ verdict: 'pass' }), shell },
    });
    expect(readRecords('r3').length).toBe(3);
    expect(readRecords('r3').map((r) => r.run_index)).toEqual([0, 1, 2]);
  });

  it('resume-run skips already-recorded (case,run_index) pairs', () => {
    writeCase('c1', agentCase('pass'));
    runEvalSuite({
      repoRoot,
      suiteOrCasePath: 's1',
      runId: 'r4',
      k: 2,
      deps: { claude: claudeOk({ verdict: 'pass' }), shell },
    });
    const before = readRecords('r4').length;
    expect(before).toBe(2);
    // resume: nothing new to do
    const res = runEvalSuite({
      repoRoot,
      suiteOrCasePath: 's1',
      runId: 'r4',
      k: 2,
      resumeRunId: 'r4',
      deps: { claude: claudeOk({ verdict: 'pass' }), shell },
    });
    expect(readRecords('r4').length).toBe(2); // no duplicates
    expect(res.summary.skipped).toBe(2);
  });

  it('marks a manual case with status manual and does not dispatch', () => {
    writeCase('m1', { ...agentCase('pass'), manual: true });
    runEvalSuite({
      repoRoot,
      suiteOrCasePath: 's1',
      runId: 'r5',
      deps: {
        claude: () => {
          throw new Error('manual case must not dispatch');
        },
        shell,
      },
    });
    const rec = readRecords('r5')[0];
    expect(rec.status).toBe('manual');
    expect(rec.assertions).toEqual([]);
  });

  it('captures an invocation error and errors the assertions', () => {
    writeCase('c1', agentCase('pass'));
    runEvalSuite({
      repoRoot,
      suiteOrCasePath: 's1',
      runId: 'r6',
      deps: {
        claude: () => ({
          stdout: fakeEnvelope('boom', { isError: true }),
          exitCode: 0,
        }),
        shell,
      },
    });
    const rec = readRecords('r6')[0];
    expect(rec.invocation_error).toMatch(/error/);
    expect(rec.assertions[0].outcome).toBe('error');
  });

  it('evaluates a code assertion in the workspace', () => {
    writeCase('c1', {
      schemaVersion: 1,
      subject: { kind: 'agent', name: 'sk-x' },
      fixture: 'evals/fixtures/f',
      prompt: 'p',
      assertions: [{ type: 'code', cmd: 'test -f RFC.md' }],
    });
    runEvalSuite({
      repoRoot,
      suiteOrCasePath: 's1',
      runId: 'r7',
      deps: { claude: claudeOk({}), shell },
    });
    expect(readRecords('r7')[0].assertions[0].outcome).toBe('pass');
  });

  it('validate-only reports discovery without dispatching', () => {
    writeCase('c1', agentCase('pass'));
    writeCase('bad', { schemaVersion: 2 });
    const res = runEvalSuite({
      repoRoot,
      suiteOrCasePath: 's1',
      runId: 'r8',
      validateOnly: true,
      deps: {
        claude: () => {
          throw new Error('must not dispatch in validate-only');
        },
        shell,
      },
    });
    expect(res.exitCode).toBe(1); // a bad case → non-zero
    expect(res.summary.valid_cases).toBe(1);
    expect(res.summary.discovery_errors.length).toBe(1);
  });
});
