import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseConfig,
  VERIFIER_SURFACES,
  type VerifierSurface,
  type VerifierTier,
} from './config.js';

/**
 * 3.1 (ADR-0005): quorum membership as data. This is the single source the
 * orchestrators load — bundled dimensions are the defaults, operator entries
 * from .sidekick/config.json extend them. Builtins are non-displaceable:
 * operator quorums are strictly additive, so a colliding dimension is
 * skipped, never substituted.
 */

export interface QuorumMember {
  dimension: string;
  agent: string;
  tier: VerifierTier;
  builtin: boolean;
}

type BundledMember = Omit<QuorumMember, 'builtin'>;

/**
 * The de-facto quorums the skills hardcoded before 3.1, verbatim. The
 * artifact quorums gate a capped drafter loop (binding); the review
 * dimensions inform a judged route (advisory). Which review dimensions
 * *fire* on a given diff stays orchestrator judgment — this table is
 * membership, not selection.
 */
const BUNDLED: Record<VerifierSurface, BundledMember[]> = {
  review: [
    {
      dimension: 'correctness',
      agent: 'sk-correctness-reviewer',
      tier: 'advisory',
    },
    { dimension: 'security', agent: 'sk-security-reviewer', tier: 'advisory' },
    {
      dimension: 'maintainability',
      agent: 'sk-maintainability-reviewer',
      tier: 'advisory',
    },
    { dimension: 'test', agent: 'sk-test-reviewer', tier: 'advisory' },
    { dimension: 'goal', agent: 'sk-goal-verifier', tier: 'advisory' },
    {
      dimension: 'architecture',
      agent: 'sk-architecture-reviewer',
      tier: 'advisory',
    },
  ],
  rfc: [
    {
      dimension: 'structural',
      agent: 'sk-structural-checker',
      tier: 'binding',
    },
    { dimension: 'coherence', agent: 'sk-coherence-checker', tier: 'binding' },
  ],
  plan: [
    {
      dimension: 'structural',
      agent: 'sk-structural-checker',
      tier: 'binding',
    },
    { dimension: 'crossref', agent: 'sk-crossref-checker', tier: 'binding' },
    { dimension: 'coherence', agent: 'sk-coherence-checker', tier: 'binding' },
  ],
  decision: [
    {
      dimension: 'structural',
      agent: 'sk-structural-checker',
      tier: 'binding',
    },
    { dimension: 'coherence', agent: 'sk-coherence-checker', tier: 'binding' },
  ],
};

export interface ResolveVerifiersInput {
  repoRoot: string;
  claudeHome: string;
  surface: VerifierSurface;
}

export interface ResolvedQuorum {
  surface: VerifierSurface;
  members: QuorumMember[];
  warnings: string[];
}

function agentDefinitionExists(
  agent: string,
  repoRoot: string,
  claudeHome: string,
): boolean {
  return [
    path.join(repoRoot, '.claude', 'agents', `${agent}.md`),
    path.join(claudeHome, 'agents', `${agent}.md`),
  ].some((p) => fs.existsSync(p));
}

export function resolveVerifiers(input: ResolveVerifiersInput): ResolvedQuorum {
  const { repoRoot, claudeHome, surface } = input;
  const members: QuorumMember[] = BUNDLED[surface].map((m) => ({
    ...m,
    builtin: true,
  }));
  const warnings: string[] = [];

  const configPath = path.join(repoRoot, '.sidekick', 'config.json');
  if (!fs.existsSync(configPath)) {
    warnings.push(
      'no .sidekick/config.json — bundled quorum only (run `sidekick init` to add operator verifiers)',
    );
    return { surface, members, warnings };
  }

  const parsed = parseConfig(fs.readFileSync(configPath, 'utf-8'));
  if (!parsed.ok) {
    warnings.push(
      `.sidekick/config.json is invalid (${parsed.error}) — operator verifiers unavailable this run; bundled quorum only`,
    );
    return { surface, members, warnings };
  }
  warnings.push(...parsed.warnings);

  const builtinDims = new Set(members.map((m) => m.dimension));
  for (const entry of parsed.value.verifiers) {
    if (!entry.surfaces.includes(surface)) continue;
    if (builtinDims.has(entry.dimension)) {
      warnings.push(
        `verifier "${entry.dimension}": collides with a builtin dimension on the ${surface} surface — skipped (builtins are non-displaceable; operator quorums are additive)`,
      );
      continue;
    }
    if (!agentDefinitionExists(entry.agent, repoRoot, claudeHome)) {
      warnings.push(
        `verifier "${entry.dimension}": no agent definition found for "${entry.agent}" (looked in .claude/agents/ at the repo and user level) — skipped`,
      );
      continue;
    }
    members.push({
      dimension: entry.dimension,
      agent: entry.agent,
      tier: entry.tier,
      builtin: false,
    });
  }

  return { surface, members, warnings };
}

export interface VerifiersCliResult {
  stdout: string;
  exitCode: number;
}

export function runVerifiersCli(opts: {
  repoRoot: string;
  claudeHome: string;
  surface: string | undefined;
}): VerifiersCliResult {
  const { repoRoot, claudeHome, surface } = opts;
  if (
    surface === undefined ||
    !VERIFIER_SURFACES.includes(surface as VerifierSurface)
  ) {
    return {
      stdout: JSON.stringify({
        error: `"--surface" must be one of ${VERIFIER_SURFACES.join(' | ')}`,
      }),
      exitCode: 1,
    };
  }
  const resolved = resolveVerifiers({
    repoRoot,
    claudeHome,
    surface: surface as VerifierSurface,
  });
  return { stdout: JSON.stringify(resolved), exitCode: 0 };
}
