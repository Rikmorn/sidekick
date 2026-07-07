import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseConfig,
  VERIFIER_SURFACES,
  type VerifierSurface,
  type VerifierTier,
} from './config.js';
import { hashRfcContent } from './hash-rfc.js';

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

/** Resolve an agent .md by the canonical order: repo `.claude/agents/` then `~/.claude/agents/`. */
function resolveAgentPath(
  agent: string,
  repoRoot: string,
  claudeHome: string,
): string | null {
  const candidates = [
    path.join(repoRoot, '.claude', 'agents', `${agent}.md`),
    path.join(claudeHome, 'agents', `${agent}.md`),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function agentDefinitionExists(
  agent: string,
  repoRoot: string,
  claudeHome: string,
): boolean {
  return resolveAgentPath(agent, repoRoot, claudeHome) !== null;
}

/**
 * D7 (ADR-0006) resolve-time binding validation. A binding operator entry only
 * BINDS when a calibration certificate exists, parses, and still pins the live
 * agent file's hash. The check is existence + parse + hash match — stats are
 * NOT re-judged here (the certificate is only ever written when thresholds
 * passed). Editing a graduated prompt changes its hash and auto-revokes binding.
 */
function validateBinding(
  agent: string,
  repoRoot: string,
  claudeHome: string,
): { ok: true } | { ok: false; reason: string } {
  const certPath = path.join(
    repoRoot,
    '.sidekick',
    'calibrations',
    `${agent}.json`,
  );
  if (!fs.existsSync(certPath)) {
    return { ok: false, reason: 'no calibration certificate' };
  }
  let cert: { agent_file_hash?: unknown };
  try {
    cert = JSON.parse(fs.readFileSync(certPath, 'utf-8'));
  } catch {
    return { ok: false, reason: 'unparseable calibration certificate' };
  }
  if (typeof cert.agent_file_hash !== 'string') {
    return { ok: false, reason: 'certificate missing agent_file_hash' };
  }
  const agentPath = resolveAgentPath(agent, repoRoot, claudeHome);
  if (agentPath === null) {
    return { ok: false, reason: 'agent file no longer resolves' };
  }
  const liveHash = hashRfcContent(fs.readFileSync(agentPath, 'utf-8'));
  if (liveHash !== cert.agent_file_hash) {
    return {
      ok: false,
      reason: 'agent file hash mismatch — prompt edited since calibration',
    };
  }
  return { ok: true };
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
    // D7: a binding operator entry is only honoured with a valid, hash-matched
    // certificate; otherwise it degrades to advisory (loudly) but still mounts.
    let tier: VerifierTier = entry.tier;
    if (entry.tier === 'binding') {
      const check = validateBinding(entry.agent, repoRoot, claudeHome);
      if (!check.ok) {
        warnings.push(
          `verifier "${entry.dimension}": binding not honoured (${check.reason}) — degraded to advisory`,
        );
        tier = 'advisory';
      }
    }
    members.push({
      dimension: entry.dimension,
      agent: entry.agent,
      tier,
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
