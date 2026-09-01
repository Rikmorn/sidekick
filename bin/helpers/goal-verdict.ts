/**
 * The per-goal verdict rule (GAP / INCONCLUSIVE / ACHIEVED), lifted out of
 * prompt prose into deterministic code. It was duplicated verbatim in the
 * `<reasoning>` of the goal-verify and review skills — the project's own
 * "a value computed in two places" smell; the goal-verify orchestrator has
 * since folded into `/sk-review`'s goal dimension. This is the single source.
 *
 * Input is sk-goal-verifier's deliverable (the relevant subset). The agent does
 * all the *reasoning* (deriving each artifact's MISSING/STUB/HOLLOW/ORPHANED
 * verdict, each truth's status, the anti-patterns); this helper only rolls those
 * judgments up into a per-goal verdict and the goals-only overall verdict.
 *
 * The verbatim rule (from both orchestrators):
 *   per-goal GAP        if ANY artifact.verdict ∈ {MISSING,STUB,HOLLOW,ORPHANED}
 *                       OR ANY anti_pattern tied_to_goal == goal.id && severity == "blocker"
 *                       OR ANY truth.status == "failed"
 *   per-goal INCONCLUSIVE elif needs_human_verification == true
 *                       OR ANY truth.status == "inconclusive"
 *   per-goal ACHIEVED   else
 *   overall gaps_found  if ANY goal GAP; elif ANY goal INCONCLUSIVE → inconclusive; else passed
 *
 * Out of scope (stays in the orchestrators): routing (finish-build vs redesign
 * has a judgment fallback and isn't duplicated) and sk-review's cross-dimension
 * overall (it folds in code findings).
 */

export type GoalVerdict = 'GAP' | 'INCONCLUSIVE' | 'ACHIEVED';
export type OverallGoalVerdict = 'gaps_found' | 'inconclusive' | 'passed';

export interface GoalVerdictInput {
  goals: Array<{
    id: string;
    truths?: Array<{ status?: string }>;
    artifacts?: Array<{ verdict?: string }>;
    needs_human_verification?: boolean;
  }>;
  anti_patterns?: Array<{ tied_to_goal?: string; severity?: string }>;
}

export interface GoalVerdictResult {
  goals: Array<{ id: string; verdict: GoalVerdict }>;
  overall: OverallGoalVerdict;
}

const GAP_ARTIFACT_VERDICTS: ReadonlySet<string> = new Set([
  'MISSING',
  'STUB',
  'HOLLOW',
  'ORPHANED',
]);

export function goalVerdict(input: GoalVerdictInput): GoalVerdictResult {
  const antiPatterns = input.anti_patterns ?? [];

  const goals = input.goals.map((g) => {
    const artifacts = g.artifacts ?? [];
    const truths = g.truths ?? [];

    const hasBadArtifact = artifacts.some((a) =>
      GAP_ARTIFACT_VERDICTS.has(a.verdict ?? ''),
    );
    const hasBlockerAntiPattern = antiPatterns.some(
      (ap) => ap.tied_to_goal === g.id && ap.severity === 'blocker',
    );
    const hasFailedTruth = truths.some((t) => t.status === 'failed');

    let verdict: GoalVerdict;
    if (hasBadArtifact || hasBlockerAntiPattern || hasFailedTruth) {
      verdict = 'GAP';
    } else if (
      g.needs_human_verification === true ||
      truths.some((t) => t.status === 'inconclusive')
    ) {
      verdict = 'INCONCLUSIVE';
    } else {
      verdict = 'ACHIEVED';
    }

    return { id: g.id, verdict };
  });

  let overall: OverallGoalVerdict;
  if (goals.some((g) => g.verdict === 'GAP')) {
    overall = 'gaps_found';
  } else if (goals.some((g) => g.verdict === 'INCONCLUSIVE')) {
    overall = 'inconclusive';
  } else {
    overall = 'passed';
  }

  return { goals, overall };
}

/**
 * CLI entry: parse sk-goal-verifier's deliverable JSON from stdin and return the
 * per-goal verdicts + goals-only overall as a JSON string. Lenient on optional
 * fields (missing artifacts/truths → empty; missing id → ""), strict on the one
 * structural requirement: `goals` must be an array.
 */
export function runGoalVerdictCli(stdin: string): string {
  let raw: unknown;
  try {
    raw = JSON.parse(stdin);
  } catch {
    return JSON.stringify({
      error: 'invalid_input',
      reason: 'stdin is not valid JSON',
    });
  }
  if (typeof raw !== 'object' || raw === null) {
    return JSON.stringify({
      error: 'invalid_input',
      reason: 'expected a JSON object',
    });
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.goals)) {
    return JSON.stringify({
      error: 'invalid_input',
      reason: 'goals must be an array',
    });
  }

  const goals = (obj.goals as unknown[]).map((g) => {
    const goal = (typeof g === 'object' && g !== null ? g : {}) as Record<
      string,
      unknown
    >;
    return {
      id: typeof goal.id === 'string' ? goal.id : String(goal.id ?? ''),
      truths: Array.isArray(goal.truths)
        ? (goal.truths as Array<{ status?: string }>)
        : [],
      artifacts: Array.isArray(goal.artifacts)
        ? (goal.artifacts as Array<{ verdict?: string }>)
        : [],
      needs_human_verification: goal.needs_human_verification === true,
    };
  });

  const antiPatterns = Array.isArray(obj.anti_patterns)
    ? (obj.anti_patterns as Array<{ tied_to_goal?: string; severity?: string }>)
    : [];

  return JSON.stringify(goalVerdict({ goals, anti_patterns: antiPatterns }));
}
