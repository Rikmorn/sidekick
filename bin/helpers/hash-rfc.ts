/**
 * The canonical content hash. Not RFC-specific despite the filename: calibration
 * certificates (`eval-calibrate.ts`) and verifier binding revocation
 * (`verifiers.ts`) both pin content by this hash, and both break if it changes.
 *
 * The hash is SHA-256 of the content read as UTF-8 — whole file, including any
 * frontmatter — hex-encoded. It has no CLI surface: the `hash-rfc` subcommand
 * and the `.sidekick/plans/<slug>/` path builder retired with the pin (#29).
 */

import * as crypto from 'node:crypto';

/** Canonical content hash: hex SHA-256. */
export function hashRfcContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
