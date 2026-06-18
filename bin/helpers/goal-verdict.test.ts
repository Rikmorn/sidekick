import { describe, expect, it } from 'bun:test';
import { goalVerdict, runGoalVerdictCli } from './goal-verdict.js';

describe('goalVerdict — per-goal verdict', () => {
  it('ACHIEVED when all artifacts VERIFIED, all truths verified, no human-verify, no blocker', () => {
    const r = goalVerdict({
      goals: [
        {
          id: 'g1',
          truths: [{ status: 'verified' }],
          artifacts: [{ verdict: 'VERIFIED' }],
          needs_human_verification: false,
        },
      ],
      anti_patterns: [],
    });
    expect(r.goals).toEqual([{ id: 'g1', verdict: 'ACHIEVED' }]);
    expect(r.overall).toBe('passed');
  });

  it.each([
    'MISSING',
    'STUB',
    'HOLLOW',
    'ORPHANED',
  ])('GAP when an artifact verdict is %s', (bad) => {
    const r = goalVerdict({
      goals: [
        {
          id: 'g1',
          truths: [{ status: 'verified' }],
          artifacts: [{ verdict: 'VERIFIED' }, { verdict: bad }],
        },
      ],
    });
    expect(r.goals[0]?.verdict).toBe('GAP');
    expect(r.overall).toBe('gaps_found');
  });

  it('GAP when a blocker anti-pattern is tied to the goal', () => {
    const r = goalVerdict({
      goals: [{ id: 'g2', artifacts: [{ verdict: 'VERIFIED' }] }],
      anti_patterns: [{ tied_to_goal: 'g2', severity: 'blocker' }],
    });
    expect(r.goals[0]?.verdict).toBe('GAP');
  });

  it('GAP when a contributing truth has failed', () => {
    const r = goalVerdict({
      goals: [
        {
          id: 'g1',
          truths: [{ status: 'verified' }, { status: 'failed' }],
          artifacts: [{ verdict: 'VERIFIED' }],
        },
      ],
    });
    expect(r.goals[0]?.verdict).toBe('GAP');
  });

  it('INCONCLUSIVE when needs_human_verification is true (no GAP trigger)', () => {
    const r = goalVerdict({
      goals: [
        {
          id: 'g1',
          truths: [{ status: 'verified' }],
          artifacts: [{ verdict: 'VERIFIED' }],
          needs_human_verification: true,
        },
      ],
    });
    expect(r.goals[0]?.verdict).toBe('INCONCLUSIVE');
    expect(r.overall).toBe('inconclusive');
  });

  it('INCONCLUSIVE when a truth is inconclusive (no GAP trigger)', () => {
    const r = goalVerdict({
      goals: [
        {
          id: 'g1',
          truths: [{ status: 'inconclusive' }],
          artifacts: [{ verdict: 'VERIFIED' }],
        },
      ],
    });
    expect(r.goals[0]?.verdict).toBe('INCONCLUSIVE');
  });

  it('GAP takes precedence over INCONCLUSIVE within a goal', () => {
    const r = goalVerdict({
      goals: [
        {
          id: 'g1',
          truths: [{ status: 'inconclusive' }],
          artifacts: [{ verdict: 'MISSING' }],
          needs_human_verification: true,
        },
      ],
    });
    expect(r.goals[0]?.verdict).toBe('GAP');
  });

  it('does not trigger GAP from an anti-pattern tied to a different goal', () => {
    const r = goalVerdict({
      goals: [{ id: 'g1', artifacts: [{ verdict: 'VERIFIED' }] }],
      anti_patterns: [{ tied_to_goal: 'g2', severity: 'blocker' }],
    });
    expect(r.goals[0]?.verdict).toBe('ACHIEVED');
  });

  it('does not trigger GAP from a non-blocker (warning) anti-pattern', () => {
    const r = goalVerdict({
      goals: [{ id: 'g1', artifacts: [{ verdict: 'VERIFIED' }] }],
      anti_patterns: [{ tied_to_goal: 'g1', severity: 'warning' }],
    });
    expect(r.goals[0]?.verdict).toBe('ACHIEVED');
  });
});

describe('goalVerdict — overall', () => {
  it('gaps_found when any goal is GAP, even if another is INCONCLUSIVE', () => {
    const r = goalVerdict({
      goals: [
        { id: 'g1', artifacts: [{ verdict: 'MISSING' }] },
        { id: 'g2', needs_human_verification: true },
      ],
    });
    expect(r.overall).toBe('gaps_found');
  });

  it('inconclusive when no GAP but at least one INCONCLUSIVE', () => {
    const r = goalVerdict({
      goals: [
        { id: 'g1', artifacts: [{ verdict: 'VERIFIED' }] },
        { id: 'g2', truths: [{ status: 'inconclusive' }] },
      ],
    });
    expect(r.overall).toBe('inconclusive');
  });

  it('passed when every goal is ACHIEVED', () => {
    const r = goalVerdict({
      goals: [
        { id: 'g1', artifacts: [{ verdict: 'VERIFIED' }] },
        { id: 'g2', truths: [{ status: 'verified' }] },
      ],
    });
    expect(r.overall).toBe('passed');
  });

  it('passed for an empty goals array', () => {
    const r = goalVerdict({ goals: [] });
    expect(r).toEqual({ goals: [], overall: 'passed' });
  });

  it('treats a goal with no artifacts/truths as ACHIEVED (nothing fails)', () => {
    const r = goalVerdict({ goals: [{ id: 'g1' }] });
    expect(r.goals[0]?.verdict).toBe('ACHIEVED');
  });
});

describe('runGoalVerdictCli', () => {
  it('parses a verifier deliverable from stdin and returns verdicts JSON', () => {
    const out = runGoalVerdictCli(
      JSON.stringify({
        goals: [
          { id: 'g1', artifacts: [{ verdict: 'VERIFIED' }] },
          { id: 'g2', artifacts: [{ verdict: 'STUB' }] },
        ],
        anti_patterns: [],
      }),
    );
    expect(JSON.parse(out)).toEqual({
      goals: [
        { id: 'g1', verdict: 'ACHIEVED' },
        { id: 'g2', verdict: 'GAP' },
      ],
      overall: 'gaps_found',
    });
  });

  it('honours a top-level blocker anti-pattern from the full deliverable shape', () => {
    const out = runGoalVerdictCli(
      JSON.stringify({
        goals: [{ id: 'g1', artifacts: [{ verdict: 'VERIFIED' }] }],
        anti_patterns: [
          { file: 'x.ts', line: '1', severity: 'blocker', tied_to_goal: 'g1' },
        ],
        spot_checks: [],
        inconclusive: false,
      }),
    );
    expect(JSON.parse(out).goals[0]).toEqual({ id: 'g1', verdict: 'GAP' });
  });

  it('is lenient on goals missing artifacts/truths', () => {
    const out = runGoalVerdictCli(JSON.stringify({ goals: [{ id: 'g1' }] }));
    expect(JSON.parse(out)).toEqual({
      goals: [{ id: 'g1', verdict: 'ACHIEVED' }],
      overall: 'passed',
    });
  });

  it('returns an error JSON on malformed stdin', () => {
    expect(JSON.parse(runGoalVerdictCli('not json'))).toMatchObject({
      error: 'invalid_input',
    });
  });

  it('returns an error JSON when goals is not an array', () => {
    expect(
      JSON.parse(runGoalVerdictCli(JSON.stringify({ goals: 'nope' }))),
    ).toMatchObject({ error: 'invalid_input' });
  });
});
