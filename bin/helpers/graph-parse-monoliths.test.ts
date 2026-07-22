import { describe, expect, it } from 'bun:test';
import { emptyCrosswalk } from './graph-model.js';
import {
  parseAdr,
  parseAdrHeader,
  parseCrosswalk,
  parseEpic,
} from './graph-parse-monoliths.js';

/** Fixture snippets are taken verbatim from the live tree (ops-2 gate). */
const EPIC_SNIPPET = [
  '### Phase 3 — Verification & capability foundations',
  '',
  '| ID | Was | Item | Sources | Deps |',
  '|---|---|---|---|---|',
  '| **3.2** ✅ | E7 | **Independent guardrail/output verification** — reuses the quorum. | `verification-autonomy`, `prompting` | ✅ done 2026-07-03; 4.2 reuses; relates 3.1 |',
  '| **3.4** | E8 → 3.1 | **Externalize the sizing/routing signal** — self-confidence is broken. | `agentic-loops` (#1), `context-memory` | 3.3 |',
  '| **5.1** | E22 | **Generated enforcement** — per-project gates. | ADR-0002 §5, ADR-0005 | 3.3, 3.1, 0.5; relates 3.2/3.6 |',
  '',
  '## Crosswalk — legacy `E#` ↔ phase.item',
  '',
  '| E# | New | E# | New | E# | New |',
  '|---|---|---|---|---|---|',
  '| E1 | 0.1 | E9 | 3.5 | E17 | 5.3 |',
  '| E3 | 0.6 + Phase 1¹ | E11 | 3.6 | E19 | 0.3 |',
  '| E7 | 3.2 | E8 | 3.4 | E13 | 3.3 |',
  '',
  '**Re-baseline 2 delta** (first cut, 2026-06-18). Load-bearing moves: eval keystone `4.1→3.4`; operator-dial `4.2→3.5`.',
  '',
  '**Re-baseline 3 delta** (v2 → execution-order cut, 2026-07-03). v2→v3: verifier seam `3.9→3.1` · eval keystone `3.4→3.3` · sizing/routing signal `3.1→3.4` · forcing-function `3.3→3.5`.',
].join('\n');

describe('parseCrosswalk', () => {
  const cw = parseCrosswalk(EPIC_SNIPPET);

  it('reads the legacy E# table, including multiple pairs per row', () => {
    expect(cw.legacy.get('E1')).toBe('0.1');
    expect(cw.legacy.get('E9')).toBe('3.5');
    expect(cw.legacy.get('E17')).toBe('5.3');
    expect(cw.legacy.get('E13')).toBe('3.3');
  });

  it('records a split mapping as null rather than picking a side', () => {
    expect(cw.legacy.has('E3')).toBe(true);
    expect(cw.legacy.get('E3')).toBeNull();
  });

  it('reads only the re-baseline 3 delta, never the intermediate v1→v2 one', () => {
    expect(cw.v2ToV3.get('3.4')).toBe('3.3');
    expect(cw.v2ToV3.get('3.9')).toBe('3.1');
    // `4.1→3.4` belongs to re-baseline 2 (v1→v2) and must not be applied.
    expect(cw.v2ToV3.has('4.1')).toBe(false);
  });

  it('collects the live item ID set from the roadmap tables', () => {
    expect([...cw.known].sort()).toEqual(['3.2', '3.4', '5.1']);
  });
});

describe('parseEpic', () => {
  const cw = parseCrosswalk(EPIC_SNIPPET);
  for (const id of ['0.5', '3.1', '3.3', '3.6']) cw.known.add(id);
  const result = parseEpic(EPIC_SNIPPET, 'docs/EPIC.md', cw);

  it('emits plat-namespaced item entities with titles and status', () => {
    const item = result.entities.find((e) => e.id === 'plat-3.2');
    expect(item).toBeDefined();
    expect(item?.kind).toBe('item');
    expect(item?.title).toBe('Independent guardrail/output verification');
    expect(item?.status).toBe('done');
    expect(item?.data).toEqual({ phase: '3' });
    expect(result.entities.find((e) => e.id === 'plat-3.4')?.status).toBe(
      'open',
    );
  });

  it('reads completion however the phase spells it', () => {
    // Three spellings live in EPIC.md: a tick in the ID cell (Phase 1-3), a
    // date in a Done column, and a phase heading marked complete (Phase 0).
    // Reading only the tick under-reports finished work by a whole phase.
    const phase0 = [
      '### Phase 0 — Foundations & toolchain — ✅ DONE',
      '',
      '| ID | Was | Item | Done |',
      '|---|---|---|---|',
      '| **0.1** | E1 | Revise the authoring discipline | 2026-06-09 |',
      '| **0.2** | E2 | Platform-primitives scoping | 2026-06-10 |',
    ].join('\n');
    const cw0 = parseCrosswalk(phase0);
    const result0 = parseEpic(phase0, 'docs/EPIC.md', cw0);
    expect(result0.entities.map((e) => e.status)).toEqual(['done', 'done']);

    const openPhase = [
      '### Phase 4 — Memory',
      '',
      '| ID | Was | Item | Sources | Deps |',
      '|---|---|---|---|---|',
      '| **4.1** | E10 | **Navigability layer** | `memory` | — |',
    ].join('\n');
    const result4 = parseEpic(
      openPhase,
      'docs/EPIC.md',
      parseCrosswalk(openPhase),
    );
    expect(result4.entities[0].status).toBe('open');
  });

  it('grounds items in the ADRs their Sources column cites', () => {
    const grounds = result.edges.filter(
      (e) => e.src === 'plat-5.1' && e.rel === 'grounds',
    );
    expect(grounds.map((e) => e.dst).sort()).toEqual(['adr-0002', 'adr-0005']);
  });

  it('grounds items in research topics it can confirm exist', () => {
    const withTopics = parseEpic(
      EPIC_SNIPPET,
      'docs/EPIC.md',
      cw,
      new Set(['verification-autonomy', 'prompting', 'agentic-loops']),
    );
    const grounds = withTopics.edges.filter(
      (e) => e.src === 'plat-3.2' && e.rel === 'grounds',
    );
    expect(grounds.map((e) => e.dst).sort()).toEqual([
      'research:prompting',
      'research:verification-autonomy',
    ]);
  });

  it('creates deps edges from a pure ID list', () => {
    const deps = result.edges.filter(
      (e) => e.src === 'plat-5.1' && e.rel === 'deps',
    );
    expect(deps.map((e) => e.dst).sort()).toEqual([
      'plat-0.5',
      'plat-3.1',
      'plat-3.3',
    ]);
  });

  it('creates relates edges from an explicit relates list', () => {
    const relates = result.edges.filter(
      (e) => e.src === 'plat-5.1' && e.rel === 'relates',
    );
    expect(relates.map((e) => e.dst).sort()).toEqual(['plat-3.2', 'plat-3.6']);
  });

  it('refuses to invent a direction for an ID buried in Deps prose', () => {
    // "4.2 reuses" means 4.2 depends on 3.2 — the reverse of a deps edge.
    const wrong = result.edges.find(
      (e) => e.src === 'plat-3.2' && e.dst === 'plat-4.2',
    );
    expect(wrong).toBeUndefined();
    const flagged = result.findings.find(
      (f) => f.code === 'ambiguous-ref' && f.message.includes('4.2 reuses'),
    );
    expect(flagged).toBeDefined();
    expect(flagged?.origin).toBe('docs/EPIC.md:5');
  });

  it('still reads the relates clause of a row whose first segment was ambiguous', () => {
    const relates = result.edges.filter(
      (e) => e.src === 'plat-3.2' && e.rel === 'relates',
    );
    expect(relates.map((e) => e.dst)).toEqual(['plat-3.1']);
  });
});

// ---- ADRs -------------------------------------------------------------------

const ADR_0002 = [
  '# ADR-0002 — Platform primitives: own the loop, rent the fan-out',
  '',
  '**Status:** Accepted (2026-06-10). Resolves **EPIC E2**; unblocks E4/E13; spawns E19–E22.',
  '',
  '## Context',
].join('\n');

const ADR_0005 = [
  '# ADR-0005 — Operator-authored verifiers: quorum membership as configuration',
  '',
  '> *Editorial pointer (2026-07-03, body kept as-authored):* re-baseline 3 renumbered Phase 3.',
  '',
  '**Status:** Accepted (2026-07-02, operator sign-off). Relates `3.2` / `3.4` / `3.6`.',
].join('\n');

const ADR_0006 = [
  '# ADR-0006 — Eval harness: case convention, subscription runner',
  '',
  '**Status:** Proposed (2026-07-07, from the approved `3.3` design session). Implements the eval keystone EPIC `3.3` (this body uses post-re-baseline-3 IDs).',
].join('\n');

describe('parseAdrHeader', () => {
  it('reads state and date from the status line', () => {
    const h = parseAdrHeader(ADR_0002, 'adr-0002');
    expect(h.state).toBe('Accepted');
    expect(h.date).toBe('2026-06-10');
    expect(h.title).toBe('Platform primitives: own the loop, rent the fan-out');
  });

  it('finds the status line below an editorial-pointer blockquote', () => {
    const h = parseAdrHeader(ADR_0005, 'adr-0005');
    expect(h.state).toBe('Accepted');
    expect(h.date).toBe('2026-07-02');
    expect(h.statusLineNo).toBe(5);
  });
});

describe('parseAdr', () => {
  const cw = () => {
    const c = emptyCrosswalk();
    c.legacy.set('E2', '0.2');
    c.legacy.set('E4', '2.1');
    c.legacy.set('E13', '3.3');
    c.v2ToV3.set('3.4', '3.3');
    c.v2ToV3.set('3.6', '3.7');
    for (const id of ['0.2', '2.1', '3.2', '3.3', '3.4', '3.6', '3.7']) {
      c.known.add(id);
    }
    return c;
  };

  it('emits the ADR entity with its state and decision date', () => {
    const r = parseAdr(ADR_0002, 'docs/adr/0002-x.md', 'adr-0002', cw());
    const e = r.entities[0];
    expect(e.id).toBe('adr-0002');
    expect(e.kind).toBe('adr');
    expect(e.status).toBe('Accepted');
    expect(e.data).toEqual({ decided: '2026-06-10' });
  });

  it('extracts status-prose edges through the legacy crosswalk', () => {
    const r = parseAdr(ADR_0002, 'docs/adr/0002-x.md', 'adr-0002', cw());
    const edges = r.edges.map((e) => `${e.src} ${e.rel} ${e.dst}`).sort();
    expect(edges).toContain('adr-0002 resolves plat-0.2');
    expect(edges).toContain('adr-0002 unblocks plat-2.1');
    expect(edges).toContain('adr-0002 unblocks plat-3.3');
  });

  it('flags an ID range instead of guessing its members', () => {
    const r = parseAdr(ADR_0002, 'docs/adr/0002-x.md', 'adr-0002', cw());
    expect(r.edges.some((e) => e.rel === 'spawns')).toBe(false);
    const f = r.findings.find((x) => x.message.includes('ID range'));
    expect(f?.code).toBe('ambiguous-ref');
  });

  it('normalizes v2 Phase-3 IDs in a pre-re-baseline ADR, matching its own editorial pointer', () => {
    const r = parseAdr(ADR_0005, 'docs/adr/0005-x.md', 'adr-0005', cw());
    const relates = r.edges
      .filter((e) => e.rel === 'relates')
      .map((e) => e.dst)
      .sort();
    // The ADR body says 3.2 / 3.4 / 3.6; its pointer says those are now
    // 3.2 / 3.3 / 3.7.
    expect(relates).toEqual(['plat-3.2', 'plat-3.3', 'plat-3.7']);
  });

  it('reads a post-re-baseline ADR literally', () => {
    const r = parseAdr(ADR_0006, 'docs/adr/0006-x.md', 'adr-0006', cw());
    const implementsEdges = r.edges.filter((e) => e.rel === 'implements');
    // Canonical direction: the work item implements the decision.
    expect(implementsEdges.map((e) => `${e.src} → ${e.dst}`)).toEqual([
      'plat-3.3 → adr-0006',
    ]);
  });

  it('records ADR-to-ADR supersession from the status line', () => {
    const text = [
      '# ADR-0004 — Loop identity',
      '',
      "**Status:** Accepted (2026-06-18). **Supersedes ADR-0003's `--auto`-as-a-design-mode**.",
    ].join('\n');
    const r = parseAdr(text, 'docs/adr/0004-x.md', 'adr-0004', cw());
    expect(r.edges.map((e) => `${e.src} ${e.rel} ${e.dst}`)).toContain(
      'adr-0004 supersedes adr-0003',
    );
  });

  it('reports an ADR with no status line rather than silently yielding nothing', () => {
    const r = parseAdr(
      '# ADR-0099 — Nothing',
      'docs/adr/0099.md',
      'adr-0099',
      cw(),
    );
    expect(r.entities.length).toBe(1);
    expect(r.findings[0].code).toBe('missing-frontmatter');
  });
});
