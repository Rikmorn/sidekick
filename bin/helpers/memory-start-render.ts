/**
 * The text the memory-start hook prints: line shapes, section order, and the
 * budgets that keep the whole under 9,000 characters.
 */

import * as path from 'node:path';
import type { Match } from './memory-match.js';
import type { SessionRecord, Workstream } from './memory-view.js';

export type StartSource = 'startup' | 'resume' | 'clear' | 'compact' | 'fork';

export interface StartParts {
  sessionId: string;
  source: StartSource;
  recordPath: string;
  recordExists: boolean;
  match: Match | undefined;
  statePath: string | undefined;
  state: string | undefined;
  nextSteps: string | undefined;
  otherHeadings: string[];
  records: SessionRecord[];
  family: { name: string; path: string; lines: string[] } | undefined;
  warnings: string[];
}

const TOTAL_BUDGET = 9000;
const NEXT_STEPS_BUDGET = 3000;
const STATE_AND_NEXT_BUDGET = 5000;
const RECORDS_BUDGET = 600;
const MENU_BUDGET = 1500;
const FAMILY_BUDGET = 2000;
const RESUME_LINES = 2;
const BLOCK_SEPARATOR = '\n\n';
const MENU_LEAD =
  'No workstream matched. Open workstreams, from the repo and its family:';
const MENU_ASK =
  'Ask the operator which one this session serves, or let sk-save start a new one.';
const COMPACT_WARNING =
  'This session has not saved. Save with sk-save at the next pause.';

// A block prints in array order; past the total budget, the highest `drop` goes first.
interface Block {
  text: string;
  drop: number;
}

const Drop = {
  Header: 0,
  NextSteps: 1,
  State: 2,
  Also: 3,
  Records: 4,
  Family: 5,
  Warnings: 6,
} as const;

function cutMarker(readPath: string): string {
  return `… (cut; Read ${readPath})`;
}

// A section over its budget ends at the last line break that leaves room for the marker.
function fitSection(text: string, budget: number, readPath: string): string {
  if (text.length <= budget) return text;
  const marker = cutMarker(readPath);
  const room = Math.max(0, budget - marker.length - 1);
  const head = text.slice(0, room);
  const lineBreak = head.lastIndexOf('\n');
  const kept = (lineBreak > 0 ? head.slice(0, lineBreak) : head).trimEnd();
  return `${kept}\n${marker}`;
}

function menuText(open: Workstream[], repoFolder: string): string {
  const list = open.map(
    (stream) => `- ${stream.name}: ${stream.description} (${stream.path})`,
  );
  const items = list.length > 0 ? list : ['- none'];
  const cut = fitSection(items.join('\n'), MENU_BUDGET, repoFolder);
  return [MENU_LEAD, cut, MENU_ASK].join('\n');
}

function matchLines(match: Match, repoFolder: string): string[] {
  if (match.kind === 'menu') return [menuText(match.open, repoFolder)];
  const { workstream, label, others } = match;
  const lines = [
    `Workstream: ${workstream.name}, matched by ${label}. File: ${workstream.path}.`,
  ];
  if (others.length > 0) {
    lines.push(
      `Other open workstreams: ${others.map((other) => other.name).join(', ')}`,
    );
  }
  return lines;
}

function headerBlock(parts: StartParts): Block[] {
  const { match } = parts;
  if (match === undefined) return [];
  const first = `sidekick memory: session ${parts.sessionId}. Your record is ${parts.recordPath}; save to it with the sk-save skill.`;
  const repoFolder = path.dirname(path.dirname(parts.recordPath));
  const text = [first, ...matchLines(match, repoFolder)].join('\n');
  return [{ text, drop: Drop.Header }];
}

/**
 * The hook's fitting of the two workstream sections: Next steps to its budget,
 * then State to what that leaves. `cut` says which section ran over.
 */
export function fitWorkstream(
  state: string | undefined,
  nextSteps: string | undefined,
  readPath: string,
): {
  state?: string;
  nextSteps?: string;
  cut: { state: boolean; nextSteps: boolean };
  sizes: {
    state: number;
    nextSteps: number;
    stateBudget: number;
    nextBudget: number;
  };
} {
  const next =
    nextSteps === undefined
      ? undefined
      : fitSection(nextSteps, NEXT_STEPS_BUDGET, readPath);
  const stateBudget = STATE_AND_NEXT_BUDGET - (next?.length ?? 0);
  const shownState =
    state === undefined ? undefined : fitSection(state, stateBudget, readPath);
  return {
    state: shownState,
    nextSteps: next,
    cut: {
      state: (state?.length ?? 0) > stateBudget,
      nextSteps: (nextSteps?.length ?? 0) > NEXT_STEPS_BUDGET,
    },
    sizes: {
      state: state?.length ?? 0,
      nextSteps: nextSteps?.length ?? 0,
      stateBudget,
      nextBudget: NEXT_STEPS_BUDGET,
    },
  };
}

function workstreamBlocks(parts: StartParts): Block[] {
  const { match, statePath, nextSteps, state } = parts;
  if (match?.kind !== 'matched' || statePath === undefined) return [];
  const fit = fitWorkstream(state, nextSteps, statePath);
  const also =
    parts.otherHeadings.length > 0
      ? `Also in the file: ${parts.otherHeadings.join(', ')}. Read the file for them.`
      : undefined;
  return [
    { text: fit.state, drop: Drop.State },
    { text: fit.nextSteps, drop: Drop.NextSteps },
    { text: also, drop: Drop.Also },
  ].flatMap(({ text, drop }) => (text === undefined ? [] : [{ text, drop }]));
}

function recordsBlock(parts: StartParts): Block[] {
  const { match, records } = parts;
  const [newest] = records;
  if (match?.kind !== 'matched' || newest === undefined) return [];
  const lines = records.map(
    (record) => `- ${record.date} ${record.title}: ${record.path}`,
  );
  const text = [`Recent records on ${match.workstream.name}:`, ...lines].join(
    '\n',
  );
  const fitted = fitSection(text, RECORDS_BUDGET, path.dirname(newest.path));
  return [{ text: fitted, drop: Drop.Records }];
}

function familyBlock(parts: StartParts): Block[] {
  const { family } = parts;
  if (family === undefined || family.lines.every((l) => l.trim() === '')) {
    return [];
  }
  const text = [`Family index (${family.name}):`, ...family.lines].join('\n');
  const fitted = fitSection(text, FAMILY_BUDGET, family.path);
  return [{ text: fitted, drop: Drop.Family }];
}

function warningsBlock(parts: StartParts): Block[] {
  const compactUnsaved =
    parts.match !== undefined &&
    parts.source === 'compact' &&
    !parts.recordExists;
  const texts = [
    ...parts.warnings,
    ...(compactUnsaved ? [COMPACT_WARNING] : []),
  ];
  if (texts.length === 0) return [];
  const text = texts.map((warning) => `Warning: ${warning}`).join('\n');
  return [{ text, drop: Drop.Warnings }];
}

function joined(blocks: Block[]): string {
  return blocks.map((block) => block.text).join(BLOCK_SEPARATOR);
}

// Past the total budget, whole blocks go in reverse priority; the header never does.
function withinTotal(blocks: Block[]): string {
  if (joined(blocks).length <= TOTAL_BUDGET) return joined(blocks);
  const worst = Math.max(...blocks.map((block) => block.drop));
  if (worst === Drop.Header) return joined(blocks).slice(0, TOTAL_BUDGET);
  return withinTotal(blocks.filter((block) => block.drop !== worst));
}

/**
 * The hook's `additionalContext` for one session. Pure: it cuts each section
 * to its budget, drops whole blocks past 9,000 characters in all (warnings
 * first, Next steps last, never the first line), and on
 * `resume` keeps only the first two lines.
 */
export function renderStart(parts: StartParts): string {
  const blocks = [
    ...headerBlock(parts),
    ...workstreamBlocks(parts),
    ...recordsBlock(parts),
    ...familyBlock(parts),
    ...warningsBlock(parts),
  ];
  const text = withinTotal(blocks);
  if (parts.source !== 'resume') return text;
  return text.split('\n').slice(0, RESUME_LINES).join('\n');
}
