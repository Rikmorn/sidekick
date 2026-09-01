/**
 * The canonical `pins-rfc` hash — the single implementation that `/sk-design`
 * (which sets the pin), the `check-artifact` gate (which verifies it before
 * the PLAN quorum), and `check-drift` (which verifies it at build time) all use. Before
 * this, each computed the hash its own way (Node crypto vs a `shasum -a 256`
 * shell call vs the agent's discretion); they happened to agree for UTF-8 files
 * but "everyone computes the pin the same way" was a prose promise. This makes
 * it one function — structurally preventing the 1.1 SHA-1/SHA-256 bug class.
 *
 * The hash is SHA-256 of the RFC file content read as UTF-8 (whole file,
 * including frontmatter), hex-encoded. `check-drift` imports `hashRfcContent`
 * and `rfcPathFor` from here so its `actual_hash` is computed identically.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface HashRfcInput {
  repoRoot: string;
  slug: string;
}

export interface HashRfcResult {
  slug: string;
  hash?: string;
  error?: 'missing_rfc';
  reason?: string;
}

/** Canonical pin hash: hex SHA-256 of the RFC content. */
export function hashRfcContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Canonical RFC path for a slug: `<repoRoot>/.sidekick/plans/<slug>/RFC.md`. */
export function rfcPathFor(repoRoot: string, slug: string): string {
  return path.join(repoRoot, '.sidekick', 'plans', slug, 'RFC.md');
}

export function runHashRfc(input: HashRfcInput): HashRfcResult {
  const { repoRoot, slug } = input;
  const rfcPath = rfcPathFor(repoRoot, slug);
  if (!fs.existsSync(rfcPath)) {
    return {
      slug,
      error: 'missing_rfc',
      reason: `RFC.md not found at ${rfcPath}`,
    };
  }
  const content = fs.readFileSync(rfcPath, 'utf-8');
  return { slug, hash: hashRfcContent(content) };
}

export function runHashRfcCli(
  opts: HashRfcInput & { format: 'json' | 'kv' },
): string {
  const { format, ...input } = opts;
  const result = runHashRfc(input);
  if (format === 'kv') {
    return Object.entries(result)
      .map(([k, v]) => `${k}=${v === undefined ? '' : String(v)}`)
      .join('\n');
  }
  return JSON.stringify(result, null, 2);
}
