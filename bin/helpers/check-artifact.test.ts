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

describe('check-artifact crossref', () => {
  it('ignores unused RFC entries — coverage is not crossref', () => {
    // VALID_RFC defines g1, g2, D-01, D-02; the default plan cites only g1/D-01.
    const p = writePlanPair({});
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    expect('verdict' in r && r.verdict).toBe('pass');
  });

  it('flags a dangling goal ref', () => {
    const p = writePlanPair({
      tasks: `### T-01 build the helper

**Goals:** g4
**Decisions:** D-01
**Deps:** —
**Files:**
- Create: bin/helpers/x.ts`,
    });
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(r.issues).toContainEqual({
      dimension: 'crossref',
      kind: 'dangling_goal',
      ref: 'g4',
      detail: 'Not defined in RFC.md ## Goals & non-goals',
    });
  });

  it('flags a dangling decision ref', () => {
    const p = writePlanPair({
      tasks: `### T-01 build the helper

**Goals:** g1
**Decisions:** D-09
**Deps:** —
**Files:**
- Create: bin/helpers/x.ts`,
    });
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(r.issues).toContainEqual({
      dimension: 'crossref',
      kind: 'dangling_decision',
      ref: 'D-09',
      detail: 'Not defined in RFC.md ## Decisions',
    });
  });

  it('flags pins_rfc_drift', () => {
    const stale = 'a1b2c3d4e5f60718';
    const p = writePlanPair({ pin: stale });
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(r.issues).toContainEqual({
      dimension: 'crossref',
      kind: 'pins_rfc_drift',
      expected: stale,
      actual: hashRfcContent(VALID_RFC),
    });
  });

  it('flags a dependency cycle', () => {
    const p = writePlanPair({
      checklist: '- [ ] T-01 first\n- [ ] T-02 second',
      tasks: `### T-01 first

**Goals:** g1
**Decisions:** D-01
**Deps:** T-02
**Files:**
- Create: a.ts

### T-02 second

**Goals:** g1
**Decisions:** D-01
**Deps:** T-01
**Files:**
- Create: b.ts`,
    });
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(
      r.issues.some(
        (i) => i.dimension === 'crossref' && i.kind === 'dep_cycle',
      ),
    ).toBe(true);
  });

  it('flags a dangling task dep', () => {
    const p = writePlanPair({
      tasks: `### T-01 build the helper

**Goals:** g1
**Decisions:** D-01
**Deps:** T-99
**Files:**
- Create: bin/helpers/x.ts`,
    });
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(
      r.issues.some(
        (i) => i.dimension === 'crossref' && i.kind === 'dangling_task_ref',
      ),
    ).toBe(true);
  });

  it('reports no_task_blocks when ## Tasks has no blocks', () => {
    const p = writePlanPair({ tasks: 'no blocks here' });
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(
      r.issues.some(
        (i) => i.dimension === 'crossref' && i.kind === 'no_task_blocks',
      ),
    ).toBe(true);
  });

  it('errors when the RFC is missing', () => {
    const p = write(
      '.sidekick/plans/solo/PLAN.md',
      planWith({ pin: hashRfcContent(VALID_RFC) }),
    );
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
    });
    expect('error' in r && r.error).toBe('missing_rfc');
  });

  it('honours an explicit rfcPath override', () => {
    const rfcAbs = write('elsewhere/RFC.md', VALID_RFC);
    const p = write(
      '.sidekick/plans/solo/PLAN.md',
      planWith({ pin: hashRfcContent(VALID_RFC) }),
    );
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'plan',
      rfcPath: rfcAbs,
    });
    expect('verdict' in r && r.verdict).toBe('pass');
  });

  it('passes a decision citing an existing source RFC via frontmatter', () => {
    write('docs/x/RFC.md', VALID_RFC);
    const p = write(
      'd.md',
      VALID_DECISION.replace(
        'date: 2026-09-01\n',
        'date: 2026-09-01\nsource-rfc: docs/x/RFC.md\n',
      ),
    );
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'decision',
    });
    expect('verdict' in r && r.verdict).toBe('pass');
  });

  it('flags a missing source RFC', () => {
    const p = write(
      'd.md',
      VALID_DECISION.replace(
        'date: 2026-09-01\n',
        'date: 2026-09-01\nsource-rfc: nope/RFC.md\n',
      ),
    );
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'decision',
    });
    if (!('verdict' in r) || r.verdict !== 'fail')
      throw new Error('expected fail');
    expect(r.issues).toContainEqual({
      dimension: 'crossref',
      kind: 'missing_source_rfc',
      path: 'nope/RFC.md',
      detail: 'Referenced RFC does not exist',
    });
  });

  it('resolves a markdown-link source RFC', () => {
    write('plans/t/RFC.md', VALID_RFC);
    const p = write(
      'd.md',
      VALID_DECISION.replace(
        'We needed a cache.',
        'We needed a cache. See [RFC](plans/t/RFC.md).',
      ),
    );
    const r = runCheckArtifact({
      repoRoot: dir,
      artifactPath: p,
      artifactType: 'decision',
    });
    expect('verdict' in r && r.verdict).toBe('pass');
  });
});
