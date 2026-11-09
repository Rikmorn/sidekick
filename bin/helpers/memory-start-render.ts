/**
 * The text the memory-start hook prints: line shapes, section order, the
 * budgets that keep the whole under 9,000 characters, and the gate that
 * withholds injection-shaped text from the store.
 */

import * as path from 'node:path';
import type { Match } from './memory-match.js';
import { gateHits, withheldNames, withheldPath } from './memory-patterns.js';
import type { SessionRecord, Workstream } from './memory-view.js';
import { shellArg } from './shell.js';

export type StartSource = 'startup' | 'resume' | 'clear' | 'compact' | 'fork';

/** The cached lint's count for the session's folders. */
export interface LintCount {
  count: number;
  /** Each check with findings, in the lint's id order, and its count. */
  byCheck: ReadonlyArray<{ id: string; count: number }>;
  /** Store-relative, the repo folder first, as `sidekick memory lint --folder` takes them. */
  folders: string[];
  /** When the lint ran, in local time as YYYY-MM-DD HH:MM. */
  ranAt: string;
}

export interface StartParts {
  sessionId: string;
  source: StartSource;
  /** The store's real path; a withheld line names its folder relative to it. */
  store: string;
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
  lintCount?: LintCount;
}

const TOTAL_BUDGET = 9000;
const NEXT_STEPS_BUDGET = 3000;
const STATE_AND_NEXT_BUDGET = 5000;
const RECORDS_BUDGET = 600;
const MENU_BUDGET = 1500;
const FAMILY_BUDGET = 2000;
// Leaves room for a usual header, the warnings, and the lint's count beside every other full section.
const ALSO_BUDGET = 500;
const RESUME_LINES = 2;
const BLOCK_SEPARATOR = '\n\n';
const MENU_LEAD =
  'No workstream matched. Open workstreams, from the repo and its family:';
const MENU_ASK =
  'Ask the operator which one this session serves, or let sk-save start a new one.';
const COMPACT_WARNING =
  'This session has not saved. Save with sk-save at the next pause.';
const GATE_FAILED = 'The memory gate failed, so this text is unchecked.';
const ALSO_LEAD = 'Also in the file: ';
const ALSO_TAIL = '. Read the file for them.';
const LIST_SEPARATOR = ', ';

// A block prints in array order; past the total budget, the highest `drop` goes first.
interface Block {
  text: string;
  drop: number;
}

// Text the hook prints from one store file; `dir` is the store folder the lint lists that file under.
// `tested` lists the store texts in `text`; the gate tests each on its own, as the lint checks it.
interface Source {
  file: string;
  dir: string;
  text: string;
  tested: readonly string[];
}

// The withheld line for a source, or undefined when the source prints as it is.
type Gate = (source: Source) => string | undefined;

type Matcher = (text: string) => string[];

const unchecked: Gate = () => undefined;

/** The store-relative folder, with `/` separators, that `sidekick memory lint --folder` takes and its findings name. */
export function storeFolder(store: string, dir: string): string {
  return path.relative(store, dir).split(path.sep).join('/');
}

// The file's and folder's names are checked apart from the source's text, so a name that matches withholds only itself.
function withholding(store: string, matcher: Matcher): Gate {
  return ({ file, dir, tested }) => {
    const ids = [...new Set(tested.flatMap((text) => matcher(text)))];
    if (ids.length === 0) return undefined;
    const name = withheldPath(file, store);
    const folder = withheldNames(storeFolder(store, dir));
    return `Withheld: ${name} matched ${ids.join(', ')}. Ask the operator to review it before you read that file. List it: sidekick memory lint --folder ${shellArg(folder)}`;
  };
}

const shown = (gate: Gate, source: Source): string =>
  gate(source) ?? source.text;

const fileSource = (file: string, text: string): Source => ({
  file,
  dir: path.dirname(file),
  text,
  tested: [text],
});

const shownName = (gate: Gate, stream: Workstream): string =>
  shown(gate, fileSource(stream.path, stream.name));

// A record belongs to its repo folder, the parent of `sessions/`.
const recordSource = (record: SessionRecord, text: string): Source => ({
  file: record.path,
  dir: path.dirname(path.dirname(record.path)),
  text,
  tested: [text],
});

// A match in the name or the description withholds the whole line; the path's names are checked apart.
const menuSource = (stream: Workstream, store: string): Source => ({
  ...fileSource(
    stream.path,
    `- ${stream.name}: ${stream.description} (${withheldPath(stream.path, store)})`,
  ),
  tested: [stream.name, stream.description],
});

// The lint's count outlasts the family index, the largest block, so it survives a long header.
const Drop = {
  Header: 0,
  NextSteps: 1,
  State: 2,
  Also: 3,
  Records: 4,
  Count: 5,
  Family: 6,
  Warnings: 7,
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

function menuText(
  open: Workstream[],
  store: string,
  repoFolder: string,
  gate: Gate,
): string {
  const list = open.map((stream) => shown(gate, menuSource(stream, store)));
  const items = list.length > 0 ? list : ['- none'];
  const readPath = withheldPath(repoFolder, store);
  const cut = fitSection(items.join('\n'), MENU_BUDGET, readPath);
  return [MENU_LEAD, cut, MENU_ASK].join('\n');
}

// A withheld name leaves the comma list and its line follows, so the line's command ends its line.
function othersLines(others: Workstream[], gate: Gate): string[] {
  const verdicts = others.map((other) => ({
    name: other.name,
    withheld: gate(fileSource(other.path, other.name)),
  }));
  const clean = verdicts.flatMap(({ name, withheld }) =>
    withheld === undefined ? [name] : [],
  );
  const held = verdicts.flatMap(({ withheld }) =>
    withheld === undefined ? [] : [withheld],
  );
  const list =
    clean.length > 0 ? [`Other open workstreams: ${clean.join(', ')}`] : [];
  return [...list, ...held];
}

function matchLines(
  match: Match,
  store: string,
  repoFolder: string,
  gate: Gate,
): string[] {
  if (match.kind === 'menu') {
    return [menuText(match.open, store, repoFolder, gate)];
  }
  const { workstream, label, others } = match;
  const file = withheldPath(workstream.path, store);
  return [
    `Workstream: ${shownName(gate, workstream)}, matched by ${label}. File: ${file}.`,
    ...othersLines(others, gate),
  ];
}

// The session's own record path is checked like any other, though sk-save then cannot find a withheld one.
function headerBlock(parts: StartParts, gate: Gate): Block[] {
  const { match, store } = parts;
  if (match === undefined) return [];
  const record = withheldPath(parts.recordPath, store);
  const first = `sidekick memory: session ${parts.sessionId}. Your record is ${record}; save to it with the sk-save skill.`;
  const repoFolder = path.dirname(path.dirname(parts.recordPath));
  const lines = matchLines(match, store, repoFolder, gate);
  const text = [first, ...lines].join('\n');
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

const counted = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? '' : 's'}`;

// The longest leading run of headings whose joined list fits `room`.
function leadingHeadings(headings: string[], room: number): string[] {
  const kept: string[] = [];
  let used = -LIST_SEPARATOR.length;
  for (const heading of headings) {
    used += LIST_SEPARATOR.length + heading.length;
    if (used > room) break;
    kept.push(heading);
  }
  return kept;
}

// Headings past the budget fold into a count, since the line already sends the session to the file.
function alsoText(headings: string[], budget: number): string {
  const whole = `${ALSO_LEAD}${headings.join(LIST_SEPARATOR)}${ALSO_TAIL}`;
  if (whole.length <= budget) return whole;
  const fold = `${LIST_SEPARATOR}and ${headings.length} more`;
  const room = budget - ALSO_LEAD.length - ALSO_TAIL.length - fold.length;
  const kept = leadingHeadings(headings, room);
  const rest = headings.length - kept.length;
  const list =
    kept.length === 0
      ? counted(rest, 'heading')
      : `${kept.join(LIST_SEPARATOR)}${LIST_SEPARATOR}and ${rest} more`;
  return `${ALSO_LEAD}${list}${ALSO_TAIL}`;
}

// The gate tests every heading, as the lint does; a withheld list takes the whole line.
function alsoLine(
  headings: string[],
  file: string,
  gate: Gate,
): string | undefined {
  if (headings.length === 0) return undefined;
  const list = headings.join(LIST_SEPARATOR);
  return gate(fileSource(file, list)) ?? alsoText(headings, ALSO_BUDGET);
}

function workstreamBlocks(parts: StartParts, gate: Gate): Block[] {
  const { match, statePath } = parts;
  if (match?.kind !== 'matched' || statePath === undefined) return [];
  // Gated before fitting: State's budget is what Next steps leaves.
  const gated = (text: string | undefined) =>
    text === undefined ? undefined : shown(gate, fileSource(statePath, text));
  const fit = fitWorkstream(
    gated(parts.state),
    gated(parts.nextSteps),
    withheldPath(statePath, parts.store),
  );
  return [
    { text: fit.state, drop: Drop.State },
    { text: fit.nextSteps, drop: Drop.NextSteps },
    { text: alsoLine(parts.otherHeadings, statePath, gate), drop: Drop.Also },
  ].flatMap(({ text, drop }) => (text === undefined ? [] : [{ text, drop }]));
}

function recordsBlock(parts: StartParts, gate: Gate): Block[] {
  const { match, records, store } = parts;
  const [newest] = records;
  if (match?.kind !== 'matched' || newest === undefined) return [];
  const lines = records.map(
    (record) =>
      `- ${record.date} ${shown(gate, recordSource(record, record.title))}: ${withheldPath(record.path, store)}`,
  );
  const lead = `Recent records on ${shownName(gate, match.workstream)}:`;
  const text = [lead, ...lines].join('\n');
  const readPath = withheldPath(path.dirname(newest.path), store);
  const fitted = fitSection(text, RECORDS_BUDGET, readPath);
  return [{ text: fitted, drop: Drop.Records }];
}

function familyBlock(parts: StartParts, gate: Gate): Block[] {
  const { family } = parts;
  if (family === undefined || family.lines.every((l) => l.trim() === '')) {
    return [];
  }
  // The index is one source, so a match on any line withholds all of it.
  const index = shown(gate, fileSource(family.path, family.lines.join('\n')));
  const name = withheldNames(family.name);
  const text = [`Family index (${name}):`, index].join('\n');
  const readPath = withheldPath(family.path, parts.store);
  const fitted = fitSection(text, FAMILY_BUDGET, readPath);
  return [{ text: fitted, drop: Drop.Family }];
}

const warningLine = (warning: string): string => `Warning: ${warning}`;

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
  return [{ text: texts.map(warningLine).join('\n'), drop: Drop.Warnings }];
}

// A withheld folder's --folder argument names no folder; the operator finds that folder with ls.
function countBlock(lintCount: LintCount | undefined): Block[] {
  if (lintCount === undefined || lintCount.count === 0) return [];
  const { count, byCheck, ranAt } = lintCount;
  const checks = byCheck.map((check) => `${check.id} ${check.count}`);
  const folders = lintCount.folders.map((folder) => withheldNames(folder));
  const where = folders.map((folder) => `${folder}/`).join(' and ');
  const args = folders.map((folder) => `--folder ${shellArg(folder)}`);
  const text = `Memory lint: ${counted(count, 'finding')} in ${where} (run ${ranAt}): ${checks.join(LIST_SEPARATOR)}. List them: sidekick memory lint ${args.join(' ')}`;
  return [{ text, drop: Drop.Count }];
}

function blocksOf(parts: StartParts, gate: Gate): Block[] {
  return [
    ...headerBlock(parts, gate),
    ...workstreamBlocks(parts, gate),
    ...recordsBlock(parts, gate),
    ...familyBlock(parts, gate),
    ...warningsBlock(parts),
    ...countBlock(parts.lintCount),
  ];
}

// The gate fails open: a matcher that throws leaves every source unchecked, and a
// warning says so. The warning ranks with the header, so the total budget never drops it.
function checkedBlocks(parts: StartParts, matcher: Matcher): Block[] {
  try {
    return blocksOf(parts, withholding(parts.store, matcher));
  } catch {
    const warning = { text: warningLine(GATE_FAILED), drop: Drop.Header };
    return [...blocksOf(parts, unchecked), warning];
  }
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
 * The hook's `additionalContext` for one session. Pure: it replaces each text
 * from a store file that `matcher` matches with a line withholding it. In
 * every store path and name it prints, that line's included, each name that
 * `printedHits` matches is withheld, whatever `matcher` does. It cuts each
 * section to its budget, drops whole blocks past 9,000 characters in all
 * (warnings first, Next steps last, never the first line), and on `resume`
 * keeps only the first two lines. A matcher that throws leaves the text
 * unchecked and adds a warning that the total budget never drops. A
 * `lintCount` above zero prints one line after the warnings, which the total
 * budget drops after the family index and before the records.
 */
export function renderStart(
  parts: StartParts,
  matcher: Matcher = gateHits,
): string {
  const blocks = checkedBlocks(parts, matcher);
  const text = withinTotal(blocks);
  if (parts.source !== 'resume') return text;
  return text.split('\n').slice(0, RESUME_LINES).join('\n');
}
