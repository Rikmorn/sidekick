import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCheckDrift } from './check-drift.js';
import {
  hashRfcContent,
  rfcPathFor,
  runHashRfc,
  runHashRfcCli,
} from './hash-rfc.js';

describe('hashRfcContent', () => {
  // Canonical SHA-256 test vectors — proves it is real SHA-256, not some other digest.
  it('matches the SHA-256 vector for the empty string', () => {
    expect(hashRfcContent('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('matches the SHA-256 vector for "abc"', () => {
    expect(hashRfcContent('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('rfcPathFor', () => {
  it('builds <repoRoot>/.sidekick/plans/<slug>/RFC.md', () => {
    expect(rfcPathFor('/repo', 'my-feature')).toBe(
      path.join('/repo', '.sidekick', 'plans', 'my-feature', 'RFC.md'),
    );
  });
});

describe('runHashRfc', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-hashrfc-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeRfc(slug: string, content: string): void {
    const dir = path.join(tmpDir, '.sidekick', 'plans', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'RFC.md'), content);
  }

  it('hashes the RFC file content (whole file, including frontmatter)', () => {
    const content = '---\ntitle: X\n---\n\n# RFC\n\nBody.\n';
    writeRfc('feat-a', content);
    const r = runHashRfc({ repoRoot: tmpDir, slug: 'feat-a' });
    expect(r).toEqual({ slug: 'feat-a', hash: hashRfcContent(content) });
  });

  it('returns missing_rfc when the RFC does not exist', () => {
    const r = runHashRfc({ repoRoot: tmpDir, slug: 'nope' });
    expect(r.error).toBe('missing_rfc');
    expect(r.hash).toBeUndefined();
    expect(r.reason).toContain('RFC.md not found');
  });

  // The load-bearing guarantee of 1.6: a pin set from hash-rfc is what
  // check-drift recognises as pinned — both compute the hash the same way.
  it('produces a hash that check-drift accepts as pinned (single source)', () => {
    const content =
      '# RFC: shared hash\n\nWhole-file content, incl. frontmatter.\n';
    const slug = 'shared';
    writeRfc(slug, content);

    const { hash } = runHashRfc({ repoRoot: tmpDir, slug });
    expect(hash).toBeDefined();

    // Write a PLAN.md pinned to the hash-rfc output.
    fs.writeFileSync(
      path.join(tmpDir, '.sidekick', 'plans', slug, 'PLAN.md'),
      `---\npins-rfc: ${hash}\ntitle: Plan\n---\n\nBody.\n`,
    );

    const drift = runCheckDrift({ repoRoot: tmpDir, slug });
    expect(drift.verdict).toBe('pinned');
    expect(drift.actual_hash).toBe(hash);
  });
});

describe('runHashRfcCli', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-hashrfc-cli-'));
    const dir = path.join(tmpDir, '.sidekick', 'plans', 'feat-a');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'RFC.md'), '# RFC\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emits JSON with the hash', () => {
    const out = runHashRfcCli({
      repoRoot: tmpDir,
      slug: 'feat-a',
      format: 'json',
    });
    expect(JSON.parse(out)).toEqual({
      slug: 'feat-a',
      hash: hashRfcContent('# RFC\n'),
    });
  });

  it('emits kv format', () => {
    const out = runHashRfcCli({
      repoRoot: tmpDir,
      slug: 'feat-a',
      format: 'kv',
    });
    expect(out).toContain(`hash=${hashRfcContent('# RFC\n')}`);
    expect(out).toContain('slug=feat-a');
  });

  it('emits the error JSON for a missing RFC', () => {
    const out = runHashRfcCli({
      repoRoot: tmpDir,
      slug: 'ghost',
      format: 'json',
    });
    expect(JSON.parse(out)).toMatchObject({ error: 'missing_rfc' });
  });
});
