import { describe, expect, test } from 'bun:test';
import golden from './fixtures/pm/brief-golden.json';
import { pickups } from './fixtures/pm/pickups.js';
import { renderBrief } from './pm-brief.js';
import { glanceState, type UpdateStatus } from './pm-glance.js';

const STATUSES: UpdateStatus[] = ['ON_TRACK', 'AT_RISK'];

describe('the brief and the line, held byte-identical across the pickup view', () => {
  test('the golden holds every fixture and no other', () => {
    expect(Object.keys(golden).sort()).toEqual(Object.keys(pickups).sort());
  });

  for (const [name, p] of Object.entries(pickups)) {
    const expected = golden[name as keyof typeof golden];

    test(`${name}: renderBrief equals the golden`, () => {
      expect(renderBrief(p)).toBe(expected.brief);
    });

    for (const status of STATUSES) {
      test(`${name}: glanceState with ${status} equals the golden`, () => {
        const startDate = p.milestone?.created_at.slice(0, 10) ?? '2026-01-01';
        expect(
          glanceState({
            milestone: p.milestone,
            openCount: p.open_milestones.length,
            plans: p.plans,
            drift: p.drift,
            status: { ok: true, updates: [{ status, startDate }] },
          }),
        ).toEqual(expected.glance[status]);
      });
    }
  }
});
