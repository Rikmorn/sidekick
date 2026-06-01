export type BuildCheckpoints = 'deviations-only' | 'per-wave' | 'autonomous';

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
}

const BUILD_CHECKPOINTS: readonly BuildCheckpoints[] = [
  'deviations-only',
  'per-wave',
  'autonomous',
];

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
    },
  };
}

/**
 * Load and parse .sidekick/config.json from a repo root. Returns the same
 * ParseResult shape as parseConfig, plus a special error for absence.
 */
export async function loadConfig(repoRoot: string): Promise<ParseResult> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
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
