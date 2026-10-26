import {
  GLANCE_COMPLETE_WORD,
  type GlanceState,
} from '../../plugin/hooks/board/contract.js';
import type { Drift } from './pm.js';
import type { Milestone } from './pm-data.js';
import type { Plans } from './pm-plans.js';
import { driftEntries } from './pm-view.js';

export const UPDATE_STATUSES = [
  'INACTIVE',
  'ON_TRACK',
  'AT_RISK',
  'OFF_TRACK',
  'COMPLETE',
] as const;

export type UpdateStatus = (typeof UPDATE_STATUSES)[number];

export interface StatusUpdate {
  status: UpdateStatus;
  /** `YYYY-MM-DD`, as GitHub returns it. */
  startDate: string;
}

export type StatusRead =
  | { ok: true; updates: StatusUpdate[] } // newest first
  | { ok: false };

export interface GlanceInput {
  milestone: Milestone | null;
  openCount: number;
  plans: Plans | null;
  drift: Drift;
  status: StatusRead;
}

const BY_STATUS: Record<UpdateStatus, GlanceState> = {
  ON_TRACK: { level: 'good', word: 'on track', detail: null },
  COMPLETE: { level: 'good', word: GLANCE_COMPLETE_WORD, detail: null },
  AT_RISK: { level: 'warning', word: 'at risk', detail: null },
  OFF_TRACK: { level: 'bad', word: 'off track', detail: null },
  INACTIVE: { level: 'unknown', word: 'inactive', detail: null },
};

function unknown(word: string): GlanceState {
  return { level: 'unknown', word, detail: null };
}

function floorOf(input: GlanceInput): GlanceState {
  const { milestone, status } = input;
  if (milestone === null) {
    return unknown(input.openCount > 1 ? 'pick a milestone' : 'no milestone');
  }
  if (!status.ok) return unknown('status unread');
  // GitHub returns created_at in UTC, so the first ten characters are the UTC day.
  const day = milestone.created_at.slice(0, 10);
  const counted = status.updates.find((u) => u.startDate === day);
  return counted ? BY_STATUS[counted.status] : unknown('no update');
}

const driftKinds = ({ drift, plans }: GlanceInput): string[] =>
  driftEntries(drift, plans).map((d) => d.short);

export function glanceState(input: GlanceInput): GlanceState {
  const floor = floorOf(input);
  const kinds = driftKinds(input);
  const [head, ...rest] = kinds;
  if (head === undefined) return floor;
  const detail = rest.length > 0 ? `${head} +${rest.length}` : head;
  if (floor.level === 'good' || floor.level === 'unknown') {
    return { level: 'warning', word: 'drift', detail };
  }
  return { ...floor, detail };
}
