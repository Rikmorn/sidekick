import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckDrift, runCheckDriftCli } from './check-drift.js';

// ---- helpers ----------------------------------------------------------------

/**
 * Helper: compute SHA-256 hash of a string.
 */
function hashSha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Helper: write RFC.md and PLAN.md into a temp directory structure.
 * Creates <dir>/.sidekick/plans/<slug>/ and writes both files.
 * If pinHash is null, writes PLAN.md without the pins-rfc: frontmatter.
 */
function writePlan(
  dir: string,
  slug: string,
  rfcContent: string,
  pinHash: string | null,
): void {
  const planDir = path.join(dir, '.sidekick', 'plans', slug);
  fs.mkdirSync(planDir, { recursive: true });

  // Write RFC.md
  fs.writeFileSync(path.join(planDir, 'RFC.md'), rfcContent);

  // Write PLAN.md with or without pins-rfc
  let planContent = '---\n';
  if (pinHash !== null) {
    planContent += `pins-rfc: ${pinHash}\n`;
  }
  planContent += 'title: Test Plan\n';
  planContent += '---\n\nPlan content here.\n';
  fs.writeFileSync(path.join(planDir, 'PLAN.md'), planContent);
}

// ---- test suite -------------------------------------------------------------

describe('runCheckDrift', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-drift-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Test 1: pinned — RFC and PLAN with matching pin
  it('verdict pinned when RFC hash matches PLAN pins-rfc', () => {
    const rfcContent = '# RFC: My Feature\n\nDesign document.\n';
    const expectedHash = hashSha256(rfcContent);
    writePlan(tmpDir, 'my-feature', rfcContent, expectedHash);

    const result = runCheckDrift({ repoRoot: tmpDir, slug: 'my-feature' });
    expect(result.verdict).toBe('pinned');
    expect(result.slug).toBe('my-feature');
    expect(result.expected_hash).toBe(expectedHash);
    expect(result.actual_hash).toBe(expectedHash);
  });

  // Test 2: drifted — RFC modified after pin
  it('verdict drifted when RFC hash differs from PLAN pins-rfc', () => {
    const originalRfc = '# RFC: My Feature\n\nDesign document.\n';
    const originalHash = hashSha256(originalRfc);
    writePlan(tmpDir, 'my-feature', originalRfc, originalHash);

    // Simulate modification to RFC
    const modifiedRfc = '# RFC: My Feature\n\nDesign document.\nModified.\n';
    const modifiedHash = hashSha256(modifiedRfc);
    const planDir = path.join(tmpDir, '.sidekick', 'plans', 'my-feature');
    fs.writeFileSync(path.join(planDir, 'RFC.md'), modifiedRfc);

    const result = runCheckDrift({ repoRoot: tmpDir, slug: 'my-feature' });
    expect(result.verdict).toBe('drifted');
    expect(result.expected_hash).toBe(originalHash);
    expect(result.actual_hash).toBe(modifiedHash);
    expect(result.rfc_line_count_at_pin).toBeGreaterThan(0);
  });

  // Test 3: missing_rfc — directory with PLAN but no RFC
  it('verdict missing_rfc when RFC.md not found', () => {
    const rfcContent = '# RFC\n';
    const hash = hashSha256(rfcContent);
    const planDir = path.join(tmpDir, '.sidekick', 'plans', 'my-feature');
    fs.mkdirSync(planDir, { recursive: true });

    // Write only PLAN.md, no RFC.md
    let planContent = '---\n';
    planContent += `pins-rfc: ${hash}\n`;
    planContent += 'title: Test Plan\n';
    planContent += '---\n\nPlan content here.\n';
    fs.writeFileSync(path.join(planDir, 'PLAN.md'), planContent);

    const result = runCheckDrift({ repoRoot: tmpDir, slug: 'my-feature' });
    expect(result.verdict).toBe('missing_rfc');
    expect(result.slug).toBe('my-feature');
    expect(result.reason).toContain('RFC.md not found');
  });

  // Test 4: missing_plan — directory with RFC but no PLAN
  it('verdict missing_plan when PLAN.md not found', () => {
    const planDir = path.join(tmpDir, '.sidekick', 'plans', 'my-feature');
    fs.mkdirSync(planDir, { recursive: true });

    // Write only RFC.md, no PLAN.md
    fs.writeFileSync(path.join(planDir, 'RFC.md'), '# RFC\n');

    const result = runCheckDrift({ repoRoot: tmpDir, slug: 'my-feature' });
    expect(result.verdict).toBe('missing_plan');
    expect(result.slug).toBe('my-feature');
    expect(result.reason).toContain('PLAN.md not found');
  });

  // Test 5: malformed_pin — PLAN.md without pins-rfc frontmatter
  it('verdict malformed_pin when PLAN.md has no pins-rfc frontmatter', () => {
    const rfcContent = '# RFC: My Feature\n';
    writePlan(tmpDir, 'my-feature', rfcContent, null); // null means no pinHash

    const result = runCheckDrift({ repoRoot: tmpDir, slug: 'my-feature' });
    expect(result.verdict).toBe('malformed_pin');
    expect(result.slug).toBe('my-feature');
    expect(result.reason).toContain(
      'pins-rfc frontmatter missing or malformed',
    );
  });

  // Test 6: runCheckDriftCli json format
  it('runCheckDriftCli emits JSON when format is json', () => {
    const rfcContent = '# RFC\n';
    const hash = hashSha256(rfcContent);
    writePlan(tmpDir, 'test', rfcContent, hash);

    const jsonOutput = runCheckDriftCli({
      repoRoot: tmpDir,
      slug: 'test',
      format: 'json',
    });
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.verdict).toBe('pinned');
    expect(parsed.slug).toBe('test');
  });

  // Test 7: runCheckDriftCli kv format
  it('runCheckDriftCli emits key=value when format is kv', () => {
    const rfcContent = '# RFC\n';
    const hash = hashSha256(rfcContent);
    writePlan(tmpDir, 'test', rfcContent, hash);

    const kvOutput = runCheckDriftCli({
      repoRoot: tmpDir,
      slug: 'test',
      format: 'kv',
    });
    expect(kvOutput).toContain('verdict=pinned');
    expect(kvOutput).toContain('slug=test');
    expect(kvOutput).toMatch(/expected_hash=[a-f0-9]{64}/);
  });
});
