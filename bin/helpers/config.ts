import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type BuildCheckpoints = 'deviations-only' | 'per-wave' | 'autonomous';

export type FanoutBackend = 'auto' | 'workflow' | 'agents';
export type FanoutBudget = 'quick' | 'standard' | 'deep';

export interface FanoutConfig {
  backend: FanoutBackend; // default 'auto'
  budget: FanoutBudget; // default 'standard' ('deep' is explicit opt-in per ADR-0002)
}

export const GATE_NAMES = ['typecheck', 'lint', 'test'] as const;
export type GateName = (typeof GATE_NAMES)[number];

/**
 * Gates are explicitly configured, never guessed (operator direction,
 * 2026-07-03): the consumer may not be a Node repo at all, so there is no
 * fallback runner. A missing field means "unconfigured" — resolveGates
 * surfaces it loudly so orchestrators never silently run a wrong command.
 */
export type GatesConfig = Partial<Record<GateName, string>>;

export const VERIFIER_SURFACES = ['review', 'rfc', 'plan', 'decision'] as const;
export type VerifierSurface = (typeof VERIFIER_SURFACES)[number];

export type VerifierTier = 'advisory' | 'binding';

/**
 * One operator-authored verifier (ADR-0005). `agent` names a subagent the
 * consumer's session can dispatch (a .claude/agents/ definition); `surfaces`
 * are the quorums it mounts on. `family` is the model/family seam for the
 * cross-family quorum — carried, not yet consumed.
 */
export interface VerifierEntry {
  dimension: string;
  agent: string;
  surfaces: VerifierSurface[];
  tier: VerifierTier; // operator entries are advisory until calibration graduates them
  family?: string;
}

export interface SidekickConfig {
  schemaVersion: 1;
  defaultBranch: string;
  gates: GatesConfig; // default {} — unconfigured, surfaced by resolveGates
  waveSizeCap: number; // default 4
  buildCheckpoints: BuildCheckpoints; // default 'deviations-only'
  fanout: FanoutConfig; // default { backend: 'auto', budget: 'standard' }
  verifiers: VerifierEntry[]; // default [] — valid entries only; skips land in warnings
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
  | { ok: true; value: SidekickConfig; warnings: string[] }
  | { ok: false; error: string };

type EntryResult =
  | { ok: true; entry: VerifierEntry }
  | { ok: false; issue: string };

function parseVerifierEntry(raw: unknown, index: number): EntryResult {
  const label = `verifiers[${index}]`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, issue: `${label}: must be an object — skipped` };
  }
  const e = raw as Record<string, unknown>;
  if (typeof e.dimension !== 'string' || e.dimension.length === 0) {
    return {
      ok: false,
      issue: `${label}: missing or empty "dimension" — skipped`,
    };
  }
  const name = `${label} ("${e.dimension}")`;
  if (typeof e.agent !== 'string' || e.agent.length === 0) {
    return { ok: false, issue: `${name}: missing or empty "agent" — skipped` };
  }
  if (
    !Array.isArray(e.surfaces) ||
    e.surfaces.length === 0 ||
    !e.surfaces.every((s) => VERIFIER_SURFACES.includes(s as VerifierSurface))
  ) {
    return {
      ok: false,
      issue: `${name}: "surfaces" must be a non-empty array of ${VERIFIER_SURFACES.join(' | ')} — skipped`,
    };
  }
  // D7 (ADR-0006): `binding` is accepted syntactically here. parseConfig is
  // pure, so it cannot check whether the entry has actually graduated — that
  // needs the calibration certificate on disk. `resolveVerifiers` (which has
  // filesystem access) validates a binding entry at resolve time and degrades
  // it to advisory, loudly, when the certificate is missing, unparseable, or
  // its hash no longer matches the live agent file.
  const tier = e.tier === undefined ? 'advisory' : e.tier;
  if (tier !== 'advisory' && tier !== 'binding') {
    return {
      ok: false,
      issue: `${name}: "tier" must be "advisory" or "binding" — skipped`,
    };
  }
  if (
    e.family !== undefined &&
    (typeof e.family !== 'string' || e.family.length === 0)
  ) {
    return {
      ok: false,
      issue: `${name}: "family" must be a non-empty string when present — skipped`,
    };
  }
  return {
    ok: true,
    entry: {
      dimension: e.dimension,
      agent: e.agent,
      surfaces: e.surfaces as VerifierSurface[],
      tier: tier as VerifierTier,
      ...(e.family !== undefined ? { family: e.family as string } : {}),
    },
  };
}

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
  const gates: GatesConfig = {};
  if (obj.gates !== undefined) {
    if (
      typeof obj.gates !== 'object' ||
      obj.gates === null ||
      Array.isArray(obj.gates)
    ) {
      return { ok: false, error: '"gates" must be an object' };
    }
    const rawGates = obj.gates as Record<string, unknown>;
    for (const field of GATE_NAMES) {
      if (rawGates[field] === undefined) continue;
      if (
        typeof rawGates[field] !== 'string' ||
        (rawGates[field] as string).length === 0
      ) {
        return {
          ok: false,
          error: `"gates.${field}" must be a non-empty string when present (omit it to leave the gate unconfigured)`,
        };
      }
      gates[field] = rawGates[field] as string;
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

  const warnings: string[] = [];
  const verifiers: VerifierEntry[] = [];
  if (obj.verifiers !== undefined) {
    if (!Array.isArray(obj.verifiers)) {
      return { ok: false, error: '"verifiers" must be an array' };
    }
    const mounted = new Set<string>();
    obj.verifiers.forEach((raw, index) => {
      const result = parseVerifierEntry(raw, index);
      if (!result.ok) {
        warnings.push(result.issue);
        return;
      }
      const dup = result.entry.surfaces.filter((s) =>
        mounted.has(`${result.entry.dimension} ${s}`),
      );
      if (dup.length > 0) {
        warnings.push(
          `verifiers[${index}] ("${result.entry.dimension}"): duplicate dimension on surface(s) ${dup.join(', ')} — skipped (first entry wins)`,
        );
        return;
      }
      for (const s of result.entry.surfaces) {
        mounted.add(`${result.entry.dimension} ${s}`);
      }
      verifiers.push(result.entry);
    });
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      defaultBranch: obj.defaultBranch,
      gates,
      waveSizeCap,
      buildCheckpoints,
      fanout,
      verifiers,
    },
    warnings,
  };
}

export interface ResolvedGates {
  configured: boolean; // true only when all three gates are set
  missing: GateName[];
  gates: GatesConfig;
}

/**
 * The single resolved-gates source for every orchestrator (sk-build and
 * sk-executor read this same value, so they cannot diverge). No fallback
 * commands — an unconfigured gate is a loud state, not a pnpm guess.
 */
export function resolveGates(config: SidekickConfig): ResolvedGates {
  const missing = GATE_NAMES.filter((g) => !config.gates[g]);
  return { configured: missing.length === 0, missing, gates: config.gates };
}

export interface GatesCliResult {
  stdout: string;
  exitCode: number;
}

/**
 * `sidekick gates` — prints the resolved gates as JSON. Unconfigured gates
 * are a valid (exit 0) state the caller must surface, not an error; only a
 * missing or unparseable config errors.
 */
export async function runGatesCli(opts: {
  repoRoot: string;
}): Promise<GatesCliResult> {
  const result = await loadConfig(opts.repoRoot);
  if (!result.ok) {
    const payload =
      result.error === 'missing_config'
        ? { error: 'missing_config' }
        : { error: 'invalid_config', reason: result.error };
    return { stdout: JSON.stringify(payload), exitCode: 1 };
  }
  return {
    stdout: JSON.stringify(resolveGates(result.value)),
    exitCode: 0,
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
