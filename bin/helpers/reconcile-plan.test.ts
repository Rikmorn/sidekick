import { describe, expect, it } from 'vitest';
import {
  type CommitRef,
  analyseReconciliation,
  applyFlips,
} from './reconcile-plan.js';

const PLAN = `---
slug: add-keyboard-shortcuts
pins-rfc: a1b2c3d4e5f60718
created: 2026-05-29
---

# PLAN — Add keyboard shortcuts

## Checklist

- [ ] T-01 Add keymap module
- [x] T-02 Wire keymap into the editor
- [ ] T-03 Document the shortcuts

## Tasks

### T-01: Add keymap module
...
`;

function commits(...subjects: string[]): CommitRef[] {
  return subjects.map((subject, i) => ({
    hash: `${'0'.repeat(39)}${i + 1}`,
    subject,
  }));
}

describe('analyseReconciliation', () => {
  it('parses the checklist into tasks with current check state', () => {
    const r = analyseReconciliation(PLAN, []);
    expect(r.verdict).toBe('analysed');
    expect(r.tasks.map((t) => t.id)).toEqual(['T-01', 'T-02', 'T-03']);
    expect(r.tasks[0]).toMatchObject({ id: 'T-01', checked: false });
    expect(r.tasks[1]).toMatchObject({ id: 'T-02', checked: true });
  });

  it('matches commits to tasks by [T-NN] tag, integer-compared', () => {
    const r = analyseReconciliation(
      PLAN,
      commits('feat(keymap): add module [T-1]', 'docs: shortcuts [T-03]'),
    );
    const t1 = r.tasks.find((t) => t.id === 'T-01');
    const t3 = r.tasks.find((t) => t.id === 'T-03');
    expect(t1?.hasMatch).toBe(true);
    expect(t1?.commits).toHaveLength(1);
    expect(t3?.hasMatch).toBe(true);
  });

  it('proposes flips only for unchecked tasks that have a tagged match', () => {
    const r = analyseReconciliation(
      PLAN,
      commits('feat(keymap): add module [T-01]', 'chore: wire it [T-02]'),
    );
    // T-01 unchecked + matched → propose flip. T-02 matched but already checked → no flip.
    expect(r.proposed_flips).toEqual(['T-01']);
  });

  it('collects commits with no [T-NN] tag as unmapped', () => {
    const r = analyseReconciliation(
      PLAN,
      commits('feat(keymap): add module [T-01]', 'fix: stray null guard'),
    );
    expect(r.unmapped_commits.map((c) => c.subject)).toEqual([
      'fix: stray null guard',
    ]);
  });

  it('returns no_checklist when the ## Checklist section is absent', () => {
    const r = analyseReconciliation('# PLAN\n\nno checklist here\n', []);
    expect(r.verdict).toBe('no_checklist');
    expect(r.tasks).toEqual([]);
  });
});

describe('applyFlips', () => {
  it('flips [ ]→[x] only for the named task IDs, preserving everything else byte-for-byte', () => {
    const out = applyFlips(PLAN, ['T-01']);
    expect(out).toContain('- [x] T-01 Add keymap module');
    expect(out).toContain('- [x] T-02 Wire keymap into the editor'); // untouched
    expect(out).toContain('- [ ] T-03 Document the shortcuts'); // untouched
    // No other bytes changed.
    expect(out.replace('- [x] T-01', '- [ ] T-01')).toBe(PLAN);
  });

  it('is a no-op for task IDs not present in the checklist', () => {
    expect(applyFlips(PLAN, ['T-99'])).toBe(PLAN);
  });

  it('never un-checks an already-checked task', () => {
    // Asking to "flip" T-02 (already [x]) leaves it [x].
    expect(applyFlips(PLAN, ['T-02'])).toBe(PLAN);
  });
});
