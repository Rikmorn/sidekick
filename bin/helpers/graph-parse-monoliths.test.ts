import { describe, expect, it } from 'bun:test';
import { parseAdr, parseAdrHeader } from './graph-parse-monoliths.js';

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
  it('emits the ADR entity with its state and decision date', () => {
    const r = parseAdr(ADR_0002, 'docs/adr/0002-x.md', 'adr-0002');
    const e = r.entities[0];
    expect(e.id).toBe('adr-0002');
    expect(e.kind).toBe('adr');
    expect(e.status).toBe('Accepted');
    expect(e.data).toEqual({ decided: '2026-06-10' });
  });

  it('leaves work-item references in status prose alone', () => {
    // The items those legacy IDs named are GitHub issues now (#30); the ADR
    // text keeps them as authored, and the parser creates no edge for them.
    const r = parseAdr(ADR_0002, 'docs/adr/0002-x.md', 'adr-0002');
    expect(r.edges).toEqual([]);
    expect(r.findings).toEqual([]);
  });

  it('records ADR-to-ADR supersession from the status line', () => {
    const text = [
      '# ADR-0004 — Loop identity',
      '',
      "**Status:** Accepted (2026-06-18). **Supersedes ADR-0003's `--auto`-as-a-design-mode**.",
    ].join('\n');
    const r = parseAdr(text, 'docs/adr/0004-x.md', 'adr-0004');
    expect(r.edges.map((e) => `${e.src} ${e.rel} ${e.dst}`)).toContain(
      'adr-0004 supersedes adr-0003',
    );
  });

  it('canonicalizes "implemented by" to the one direction for that relation', () => {
    const text = [
      '# ADR-0009 — A decision',
      '',
      '**Status:** Accepted (2026-09-13). Implemented by ADR-0010.',
    ].join('\n');
    const r = parseAdr(text, 'docs/adr/0009-x.md', 'adr-0009');
    expect(r.edges.map((e) => `${e.src} ${e.rel} ${e.dst}`)).toEqual([
      'adr-0010 implements adr-0009',
    ]);
  });

  it('reports an ADR with no status line rather than silently yielding nothing', () => {
    const r = parseAdr('# ADR-0099 — Nothing', 'docs/adr/0099.md', 'adr-0099');
    expect(r.entities.length).toBe(1);
    expect(r.findings[0].code).toBe('missing-frontmatter');
  });
});
