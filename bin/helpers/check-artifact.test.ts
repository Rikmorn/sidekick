import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCheckArtifact } from './check-artifact.js';
import { hashRfcContent } from './hash-rfc.js';

const VALID_RFC = `---
slug: test-topic
created: 2026-09-01
status: draft
---

## Goals & non-goals

- g1: ship the thing
- g2: keep it small

## Architecture

One helper module.

## Decisions

- D-01: use the kernel
- D-02: no new deps

## Questions

None open.

## Risks

Low.
`;

const VALID_DECISION = `---
status: accepted
date: 2026-09-01
---

## Context

We needed a cache.

## Decision

In-memory cache.

## Drivers

- simplicity

## Consequences

Restart clears it.
`;

function planWith(opts: {
  pin: string;
  checklist?: string;
  tasks?: string;
}): string {
  const checklist = opts.checklist ?? '- [ ] T-01 build the helper';
  const tasks =
    opts.tasks ??
    `### T-01 build the helper

**Goals:** g1
**Decisions:** D-01
**Deps:** —
**Files:**
- Create: bin/helpers/x.ts`;
  return `---
slug: test-topic
pins-rfc: ${opts.pin}
created: 2026-09-01
---

## Checklist

${checklist}

## Tasks

${tasks}
`;
}

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-artifact-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, content: string): string {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

/** Write PLAN.md and a matching RFC.md beside it; pin defaults to correct. */
function writePlanPair(plan: {
  pin?: string;
  checklist?: string;
  tasks?: string;
}): string {
  write('.sidekick/plans/t/RFC.md', VALID_RFC);
  const pin = plan.pin ?? hashRfcContent(VALID_RFC);
  return write(
    '.sidekick/plans/t/PLAN.md',
    planWith({ pin, checklist: plan.checklist, tasks: plan.tasks }),
  );
}

describe('check-artifact structural', () => {
  it('passes a clean RFC', () => {
    const p = write('RFC.md', VALID_RFC);
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'rfc',
    });
    expect(r).toEqual({
      verdict: 'pass',
      artifact_path: p,
      artifact_type: 'rfc',
    });
  });

  it('fails an RFC missing a frontmatter key', () => {
    const p = write('RFC.md', VALID_RFC.replace('status: draft\n', ''));
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'rfc',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(r.issues).toContainEqual({
      dimension: 'structural',
      field: 'frontmatter.status',
      issue: 'missing',
    });
  });

  it('fails an RFC missing a required section', () => {
    const p = write(
      'RFC.md',
      VALID_RFC.replace('## Questions\n\nNone open.\n\n', ''),
    );
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'rfc',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(r.issues).toContainEqual({
      dimension: 'structural',
      field: 'section.## Questions',
      issue: 'missing',
    });
  });

  it('flags a placeholder body', () => {
    const p = write('RFC.md', VALID_RFC.replace('Low.', 'TBD'));
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'rfc',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(r.issues).toContainEqual({
      dimension: 'structural',
      field: 'section.## Risks',
      issue: 'empty body (placeholder)',
    });
  });

  it('flags an empty body', () => {
    const p = write('RFC.md', VALID_RFC.replace('Low.', ''));
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'rfc',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(r.issues).toContainEqual({
      dimension: 'structural',
      field: 'section.## Risks',
      issue: 'empty body',
    });
  });

  it('flags required sections out of order', () => {
    const outOfOrder = `---
slug: test-topic
created: 2026-09-01
status: draft
---

## Goals & non-goals

- g1: ship the thing

## Decisions

- D-01: use the kernel

## Architecture

One helper module.

## Questions

None open.

## Risks

Low.
`;
    const p = write('RFC.md', outOfOrder);
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'rfc',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(
      r.issues.some(
        (i) => i.dimension === 'structural' && i.field === 'sections',
      ),
    ).toBe(true);
  });

  it('permits extra sections beyond the required set', () => {
    const p = write(
      'RFC.md',
      `${VALID_RFC}\n## Research notes\n\nSome notes.\n`,
    );
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'rfc',
    });
    expect('verdict' in r && r.verdict).toBe('pass');
  });

  it('passes a clean plan', () => {
    const p = writePlanPair({});
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    expect('verdict' in r && r.verdict).toBe('pass');
  });

  it('flags a malformed pins-rfc and nothing else', () => {
    const p = writePlanPair({ pin: 'not-a-hash' });
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(r.issues).toEqual([
      {
        dimension: 'structural',
        field: 'frontmatter.pins-rfc',
        issue: 'malformed (does not match hash pattern)',
      },
    ]);
  });

  it('flags a checklist with no task rows', () => {
    const p = writePlanPair({ checklist: 'nothing here' });
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(
      r.issues.some(
        (i) =>
          i.dimension === 'structural' && i.field === 'section.## Checklist',
      ),
    ).toBe(true);
  });

  it('flags a checklist ID with no task block', () => {
    const p = writePlanPair({
      checklist: '- [ ] T-01 build the helper\n- [ ] T-02 wire it',
    });
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(r.issues).toContainEqual({
      dimension: 'structural',
      field: 'section.## Tasks',
      issue: 'no task block for T-02',
    });
  });

  it('accepts a fully-checked checklist', () => {
    const p = writePlanPair({ checklist: '- [x] T-01 build the helper' });
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    expect('verdict' in r && r.verdict).toBe('pass');
  });

  it('passes a clean decision', () => {
    const p = write('d.md', VALID_DECISION);
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'decision',
    });
    expect('verdict' in r && r.verdict).toBe('pass');
  });

  it('flags a placeholder decision section', () => {
    const p = write(
      'd.md',
      VALID_DECISION.replace('Restart clears it.', 'TBD'),
    );
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'decision',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(r.issues).toContainEqual({
      dimension: 'structural',
      field: 'section.## Consequences',
      issue: 'empty body (placeholder)',
    });
  });

  it('errors on a missing artifact', () => {
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: path.join(dir, 'nope.md'),
      artifactType: 'rfc',
    });
    expect('error' in r && r.error).toBe('missing_artifact');
  });
});
