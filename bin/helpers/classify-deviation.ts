/**
 * sk-build Q1 deviation-classification heuristics, lifted out of prompt prose
 * into deterministic code (ADR-0002 §2 — "move the Q1 heuristics table into the
 * CLI"). Given sk-executor's claimed deviation, compute whether the orchestrator
 * should proceed with the claimed route or surface a mismatch (claimed
 * `amendment` but the signal warrants a redesign).
 *
 * Thresholds are the verbatim Q1 table from skills/sk-build/SKILL.md:
 *   amendment + exactly 1 D-NN + no goal change + <=150 words  -> proceed
 *   amendment + (>=2 D-NN | goal_change | >150 words)          -> mismatch
 *   redesign / decision_opportunity                            -> proceed
 */

export type DeviationType = 'amendment' | 'redesign' | 'decision_opportunity';
export type ClassifyVerdict = 'proceed' | 'mismatch';
export type ClassifyRoute = 'amendment' | 'redesign' | 'decision';

export interface ClassifyDeviationInput {
  claimed_type: DeviationType;
  d_nn_affected: string[];
  goal_change: boolean;
  description: string;
}

export interface ClassifyDeviationResult {
  verdict: ClassifyVerdict;
  route: ClassifyRoute;
  signal: { d_nn_count: number; goal_change: boolean; word_count: number };
}

const AMENDMENT_WORD_CAP = 150;

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function classifyDeviation(
  input: ClassifyDeviationInput,
): ClassifyDeviationResult {
  const d_nn_count = input.d_nn_affected.length;
  const word_count = countWords(input.description);
  const signal = { d_nn_count, goal_change: input.goal_change, word_count };

  switch (input.claimed_type) {
    case 'redesign':
      return { verdict: 'proceed', route: 'redesign', signal };
    case 'decision_opportunity':
      return { verdict: 'proceed', route: 'decision', signal };
    case 'amendment': {
      const clean =
        d_nn_count === 1 &&
        !input.goal_change &&
        word_count <= AMENDMENT_WORD_CAP;
      return {
        verdict: clean ? 'proceed' : 'mismatch',
        route: 'amendment',
        signal,
      };
    }
  }
}

const DEVIATION_TYPES: ReadonlySet<string> = new Set([
  'amendment',
  'redesign',
  'decision_opportunity',
]);

/**
 * CLI entry: parse the executor's `deviation` block (or the bare fields) from
 * stdin and return the classification as a JSON string. Accepts either a
 * `claimed_type` key or the executor's native `type` key.
 */
export function runClassifyDeviationCli(stdin: string): string {
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
  const claimed = obj.claimed_type ?? obj.type;
  if (typeof claimed !== 'string' || !DEVIATION_TYPES.has(claimed)) {
    return JSON.stringify({
      error: 'invalid_input',
      reason: 'type must be amendment | redesign | decision_opportunity',
    });
  }
  const d_nn = Array.isArray(obj.d_nn_affected)
    ? (obj.d_nn_affected as unknown[]).map(String)
    : [];
  const result = classifyDeviation({
    claimed_type: claimed as DeviationType,
    d_nn_affected: d_nn,
    goal_change: obj.goal_change === true,
    description: typeof obj.description === 'string' ? obj.description : '',
  });
  return JSON.stringify(result);
}
