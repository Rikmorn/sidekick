import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type BuildCheckpoints = 'deviations-only' | 'per-wave' | 'autonomous';

export type FanoutBackend = 'auto' | 'workflow' | 'agents';
export type FanoutBudget = 'quick' | 'standard' | 'deep';

export interface FanoutConfig {
  backend: FanoutBackend; // default 'auto'
  budget: FanoutBudget; // default 'standard' ('deep' is explicit opt-in per ADR-0002)
}

export interface SidekickConfig {
  schemaVersion: 1;
  defaultBranch: string;
  gates: {
    typecheck: string;
    lint: string;
    test: string;
  };
  waveSizeCap: number; // default 4
  buildCheckpoints: BuildCheckpoints; // default 'deviations-only'
  fanout: FanoutConfig; // default { backend: 'auto', budget: 'standard' }
}

const BUILD_CHECKPOINTS: readonly BuildCheckpoints[] = [
  'deviations-only',
  'per-wave',
  'autonomous',
];

const FANOUT_BACKENDS: readonly FanoutBackend[] = [
  'auto',
  'workflow',
  'agents',
];

const FANOUT_BUDGETS: readonly FanoutBudget[] = ['quick', 'standard', 'deep'];

export type ParseResult =
  | { ok: true; value: SidekickConfig }
  | { ok: false; error: string };

const SUPPORTED_SCHEMA_VERSIONS = [1] as const;

export function parseConfig(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Root value must be a JSON object' };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.schemaVersion !== 'number') {
    return { ok: false, error: 'Missing or non-number "schemaVersion"' };
  }
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(obj.schemaVersion as 1)) {
    return {
      ok: false,
      error: `Unsupported schemaVersion: ${obj.schemaVersion}`,
    };
  }
  if (typeof obj.defaultBranch !== 'string' || obj.defaultBranch.length === 0) {
    return { ok: false, error: 'Missing or empty "defaultBranch"' };
  }
  if (typeof obj.gates !== 'object' || obj.gates === null) {
    return { ok: false, error: 'Missing "gates" object' };
  }
  const gates = obj.gates as Record<string, unknown>;
  for (const field of ['typecheck', 'lint', 'test'] as const) {
    if (
      typeof gates[field] !== 'string' ||
      (gates[field] as string).length === 0
    ) {
      return { ok: false, error: `Missing or empty "gates.${field}"` };
    }
  }
  let waveSizeCap = 4;
  if (obj.waveSizeCap !== undefined) {
    if (
      typeof obj.waveSizeCap !== 'number' ||
      !Number.isInteger(obj.waveSizeCap) ||
      obj.waveSizeCap < 1
    ) {
      return { ok: false, error: '"waveSizeCap" must be a positive integer' };
    }
    waveSizeCap = obj.waveSizeCap;
  }

  let buildCheckpoints: BuildCheckpoints = 'deviations-only';
  if (obj.buildCheckpoints !== undefined) {
    if (!BUILD_CHECKPOINTS.includes(obj.buildCheckpoints as BuildCheckpoints)) {
      return {
        ok: false,
        error: `"buildCheckpoints" must be one of ${BUILD_CHECKPOINTS.join(' | ')}`,
      };
    }
    buildCheckpoints = obj.buildCheckpoints as BuildCheckpoints;
  }

  let fanout: FanoutConfig = { backend: 'auto', budget: 'standard' };
  if (obj.fanout !== undefined) {
    if (
      typeof obj.fanout !== 'object' ||
      obj.fanout === null ||
      Array.isArray(obj.fanout)
    ) {
      return { ok: false, error: '"fanout" must be an object' };
    }
    const f = obj.fanout as Record<string, unknown>;
    const backend = f.backend === undefined ? 'auto' : f.backend;
    if (!FANOUT_BACKENDS.includes(backend as FanoutBackend)) {
      return {
        ok: false,
        error: `"fanout.backend" must be one of ${FANOUT_BACKENDS.join(' | ')}`,
      };
    }
    const budget = f.budget === undefined ? 'standard' : f.budget;
    if (!FANOUT_BUDGETS.includes(budget as FanoutBudget)) {
      return {
        ok: false,
        error: `"fanout.budget" must be one of ${FANOUT_BUDGETS.join(' | ')}`,
      };
    }
    fanout = {
      backend: backend as FanoutBackend,
      budget: budget as FanoutBudget,
    };
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      defaultBranch: obj.defaultBranch,
      gates: {
        typecheck: gates.typecheck as string,
        lint: gates.lint as string,
        test: gates.test as string,
      },
      waveSizeCap,
      buildCheckpoints,
      fanout,
    },
  };
}

/**
 * Load and parse .sidekick/config.json from a repo root. Returns the same
 * ParseResult shape as parseConfig, plus a special error for absence.
 */
export async function loadConfig(repoRoot: string): Promise<ParseResult> {
  const filePath = path.join(repoRoot, '.sidekick', 'config.json');
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code?: string }).code === 'ENOENT'
    ) {
      return { ok: false, error: 'missing_config' };
    }
    throw err;
  }
  return parseConfig(raw);
}
