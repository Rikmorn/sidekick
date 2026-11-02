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
  const listing = [MENU_LEAD, ...(list.length > 0 ? list : ['- none'])];
  const cut = fitSection(
    listing.join('\n'),
    MENU_BUDGET - MENU_ASK.length - 1,
    repoFolder,
  );
  return `${cut}\n${MENU_ASK}`;
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

function headerBlock(parts: StartParts): string[] {
  const { match } = parts;
  if (match === undefined) return [];
  const first = `sidekick memory: session ${parts.sessionId}. Your record is ${parts.recordPath}; save to it with the sk-save skill.`;
  const repoFolder = path.dirname(path.dirname(parts.recordPath));
  return [[first, ...matchLines(match, repoFolder)].join('\n')];
}

function workstreamBlocks(parts: StartParts): string[] {
  const { match, statePath, nextSteps, state } = parts;
  if (match?.kind !== 'matched' || statePath === undefined) return [];
  const next =
    nextSteps === undefined
      ? undefined
      : fitSection(nextSteps, NEXT_STEPS_BUDGET, statePath);
  const stateBudget = STATE_AND_NEXT_BUDGET - (next?.length ?? 0);
  const shownState =
    state === undefined ? undefined : fitSection(state, stateBudget, statePath);
  const also =
    parts.otherHeadings.length > 0
      ? `Also in the file: ${parts.otherHeadings.join(', ')}. Read the file for them.`
      : undefined;
  return [shownState, next, also].filter((block) => block !== undefined);
}

function recordsBlock(parts: StartParts): string[] {
  const { match, records } = parts;
  const [newest] = records;
  if (match?.kind !== 'matched' || newest === undefined) return [];
  const lines = records.map(
    (record) => `- ${record.date} ${record.title}: ${record.path}`,
  );
  const text = [`Recent records on ${match.workstream.name}:`, ...lines].join(
    '\n',
  );
  return [fitSection(text, RECORDS_BUDGET, path.dirname(newest.path))];
}

function familyBlock(parts: StartParts): string[] {
  const { family } = parts;
  if (family === undefined) return [];
  const text = [`Family index (${family.name}):`, ...family.lines].join('\n');
  return [fitSection(text, FAMILY_BUDGET, family.path)];
}

function warningsBlock(parts: StartParts): string[] {
  const compactUnsaved =
    parts.match !== undefined &&
    parts.source === 'compact' &&
    !parts.recordExists;
  const texts = [
    ...parts.warnings,
    ...(compactUnsaved ? [COMPACT_WARNING] : []),
  ];
  return texts.length === 0
    ? []
    : [texts.map((text) => `Warning: ${text}`).join('\n')];
}

// Drops whole blocks from the end until the text fits; the first block stays.
function withinTotal(blocks: string[]): string {
  const fitted = blocks.reduceRight((kept, _block, index) => {
    const joined = kept.join(BLOCK_SEPARATOR);
    return joined.length > TOTAL_BUDGET && index > 0
      ? kept.slice(0, index)
      : kept;
  }, blocks);
  return fitted.join(BLOCK_SEPARATOR).slice(0, TOTAL_BUDGET);
}

/**
 * The hook's `additionalContext` for one session. Pure: it cuts each section
 * to its budget, drops trailing blocks past 9,000 characters in all, and on
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
