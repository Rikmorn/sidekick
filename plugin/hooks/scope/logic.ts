// The scope mod's pure logic: what a session's flag settings hide. No engine
// calls, so the tests reach it directly.

import type { SessionContextBreakdown } from 'claude-code';
import { UNPROFILED } from '../gauge/logic';
import { cut, width } from '../lines';
import { MOD_PARTS, type ModPart } from './contract';

export interface Hidden {
  agents: ReadonlySet<string>;
  mods: ReadonlySet<ModPart>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isModPart(value: unknown): value is ModPart {
  return MOD_PARTS.some((part) => part === value);
}

function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** What a session's flag settings hide; anything malformed hides nothing. */
export function hiddenOf(flag: Record<string, unknown>): Hidden {
  const { sidekick } = flag;
  const hide = isRecord(sidekick) ? sidekick.hide : undefined;
  if (!isRecord(hide)) return { agents: new Set(), mods: new Set() };
  return {
    agents: new Set(
      listOf(hide.agents).filter(
        (name): name is string => typeof name === 'string',
      ),
    ),
    mods: new Set(listOf(hide.mods).filter(isModPart)),
  };
}

export function isOffered(hidden: Hidden, agent: string): boolean {
  return !hidden.agents.has(agent);
}

export function isPartHidden(
  flag: Record<string, unknown>,
  part: ModPart,
): boolean {
  return hiddenOf(flag).mods.has(part);
}

export type PaneTone = 'heading' | 'plain' | 'muted' | 'failure';

export interface PaneLine {
  tone: PaneTone;
  text: string;
}

export type UsageRead =
  | { ok: true; breakdown: SessionContextBreakdown }
  | { ok: false; reason: string };

const LIST_CAP = 5;
const TOKENS_PER_K = 1_000;

/** Rounds to a whole token below 1,000, and to one decimal of thousands from there: 1,949 prints `1.9k`. */
export function tokensText(tokens: number): string {
  const whole = Math.round(tokens);
  if (whole < TOKENS_PER_K) return String(whole);
  return `${(whole / TOKENS_PER_K).toFixed(1)}k`;
}

/** The folders a memory file's path prints short against, each undefined when unknown. */
export interface Places {
  session: string | undefined;
  home: string | undefined;
}

interface Item {
  name: string;
  tokens: number;
}

type Fit = (name: string, columns: number) => string;

const GAP = '  ';
const ELLIPSIS = '…';

// A path's end names the file, so a path too long keeps its end.
function keepEnd(text: string, columns: number): string {
  const length = width(text);
  if (length <= columns) return text;
  if (columns < 1) return '';
  return ELLIPSIS + [...text].slice(length - columns + 1).join('');
}

// The figure stays whole, and the name takes the columns left.
function itemText(item: Item, columns: number, fit: Fit): string {
  const figure = tokensText(item.tokens);
  const name = fit(
    item.name,
    Math.max(0, columns - width(figure) - width(GAP)),
  );
  return name === '' ? figure : `${name}${GAP}${figure}`;
}

function under(folder: string | undefined, path: string): string | undefined {
  if (folder === undefined || folder === '') return undefined;
  const prefix = `${folder}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
}

function shortPath(path: string, places: Places): string {
  const inSession = under(places.session, path);
  if (inSession !== undefined) return inSession;
  const inHome = under(places.home, path);
  return inHome === undefined ? path : `~/${inHome}`;
}

function itemLines(
  heading: string,
  items: readonly Item[],
  columns: number,
  fit: Fit = cut,
): PaneLine[] {
  if (items.length === 0) return [];
  const largest = [...items].sort((a, b) => b.tokens - a.tokens);
  const shown = largest.slice(0, LIST_CAP).map(
    (item): PaneLine => ({
      tone: 'plain',
      text: itemText(item, columns, fit),
    }),
  );
  const more = largest.length - LIST_CAP;
  const rest: PaneLine[] =
    more > 0 ? [{ tone: 'muted', text: `+${more} more` }] : [];
  return [{ tone: 'heading', text: heading }, ...shown, ...rest];
}

function hiddenLines(hidden: Hidden): PaneLine[] {
  const agents = [...hidden.agents];
  const mods = [...hidden.mods];
  if (agents.length === 0 && mods.length === 0) {
    return [{ tone: 'muted', text: 'hides nothing' }];
  }
  const lines: PaneLine[] = [];
  if (agents.length > 0) {
    lines.push({ tone: 'plain', text: `hides agents: ${agents.join(', ')}` });
  }
  if (mods.length > 0) {
    lines.push({ tone: 'plain', text: `hides mod parts: ${mods.join(', ')}` });
  }
  return lines;
}

function memoryName(
  file: { path: string; type: string },
  places: Places,
): string {
  if (file.type !== 'AutoMem') return shortPath(file.path, places);
  return `auto memory: ${file.path.slice(file.path.lastIndexOf('/') + 1)}`;
}

function usageLines(
  usage: UsageRead,
  places: Places,
  columns: number,
): PaneLine[] {
  if (!usage.ok) {
    return [
      {
        tone: 'failure',
        text: `context usage could not be read: ${usage.reason}`,
      },
    ];
  }
  const { breakdown } = usage;
  const used = breakdown.categories
    .filter((row) => row.kind === 'used')
    .map(
      (row): PaneLine => ({ tone: 'plain', text: itemText(row, columns, cut) }),
    );
  return [
    { tone: 'heading', text: 'CONTEXT' },
    ...used,
    ...itemLines(
      'AGENTS',
      breakdown.agents.map((a) => ({ name: a.agentType, tokens: a.tokens })),
      columns,
    ),
    ...itemLines(
      'SKILLS',
      (breakdown.skills?.skillFrontmatter ?? []).map((s) => ({
        name: s.name,
        tokens: s.tokens,
      })),
      columns,
    ),
    ...itemLines(
      'MEMORY FILES',
      breakdown.memoryFiles.map((m) => ({
        name: memoryName(m, places),
        tokens: m.tokens,
      })),
      columns,
      keepEnd,
    ),
  ];
}

/** The `/profile` pane: the profile, what it hides, and what loaded, each line cut to `columns`; none below one column. */
export function profilePaneLines(
  input: {
    profile: string | undefined;
    hidden: Hidden;
    usage: UsageRead;
    places: Places;
  },
  columns: number,
): PaneLine[] {
  if (columns < 1) return [];
  const lines: PaneLine[] = [
    { tone: 'heading', text: 'PROFILE' },
    input.profile === undefined
      ? { tone: 'muted', text: UNPROFILED }
      : { tone: 'plain', text: input.profile },
    ...hiddenLines(input.hidden),
    ...usageLines(input.usage, input.places, columns),
  ];
  return lines.map((line) => ({ ...line, text: cut(line.text, columns) }));
}
