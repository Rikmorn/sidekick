import * as fs from 'node:fs';
import * as path from 'node:path';
import { hashRfcContent, rfcPathFor } from './hash-rfc.js';

export type DriftVerdict =
  | 'pinned'
  | 'drifted'
  | 'missing_rfc'
  | 'missing_plan'
  | 'malformed_pin';

export interface CheckDriftInput {
  repoRoot: string;
  slug: string;
}

export interface CheckDriftResult {
  verdict: DriftVerdict;
  slug: string;
  expected_hash?: string;
  actual_hash?: string;
  rfc_line_count_at_pin?: number;
  reason?: string;
}

// ---- helpers ----------------------------------------------------------------

/**
 * Count lines in a string (newline separated).
 */
function countLines(content: string): number {
  if (!content) return 0;
  return content.split('\n').length;
}

/**
 * Parse pins-rfc: value from PLAN.md frontmatter.
 * Looks for the pattern `^pins-rfc:\s*([a-f0-9]{16,128})\s*$` with multiline flag.
 * Returns the hash string if found, null otherwise.
 */
function extractPinHash(planContent: string): string | null {
  const match = planContent.match(/^pins-rfc:\s*([a-f0-9]{16,128})\s*$/m);
  return match ? match[1] : null;
}

// ---- main export ------------------------------------------------------------

export function runCheckDrift(input: CheckDriftInput): CheckDriftResult {
  const { repoRoot, slug } = input;

  const rfcPath = rfcPathFor(repoRoot, slug);
  const planPath = path.join(repoRoot, '.sidekick', 'plans', slug, 'PLAN.md');

  // Check for missing RFC
  if (!fs.existsSync(rfcPath)) {
    return {
      verdict: 'missing_rfc',
      slug,
      reason: `RFC.md not found at ${rfcPath}`,
    };
  }

  // Check for missing PLAN
  if (!fs.existsSync(planPath)) {
    return {
      verdict: 'missing_plan',
      slug,
      reason: `PLAN.md not found at ${planPath}`,
    };
  }

  // Read both files
  const rfcContent = fs.readFileSync(rfcPath, 'utf-8');
  const planContent = fs.readFileSync(planPath, 'utf-8');

  // Compute actual RFC hash
  const actualHash = hashRfcContent(rfcContent);

  // Extract pinned hash from PLAN.md
  const expectedHash = extractPinHash(planContent);
  if (!expectedHash) {
    return {
      verdict: 'malformed_pin',
      slug,
      reason: 'pins-rfc frontmatter missing or malformed in PLAN.md',
    };
  }

  // Compare hashes
  if (actualHash === expectedHash) {
    return {
      verdict: 'pinned',
      slug,
      expected_hash: expectedHash,
      actual_hash: actualHash,
    };
  }

  // Hashes differ
  return {
    verdict: 'drifted',
    slug,
    expected_hash: expectedHash,
    actual_hash: actualHash,
    rfc_line_count_at_pin: countLines(rfcContent),
  };
}

export function runCheckDriftCli(
  opts: CheckDriftInput & { format: 'json' | 'kv' },
): string {
  const { format, ...input } = opts;
  const result = runCheckDrift(input);
  if (format === 'kv') {
    return Object.entries(result)
      .map(([k, v]) => `${k}=${v === undefined ? '' : String(v)}`)
      .join('\n');
  }
  return JSON.stringify(result, null, 2);
}
