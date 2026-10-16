// The scope mod's pure logic: what a session's flag settings hide. No engine
// calls, so the tests reach it directly.

import type { SessionContextBreakdown } from 'claude-code';
import { UNPROFILED } from '../gauge/logic';
import { cut } from '../lines';
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

interface Item {
  name: string;
  tokens: number;
}

function itemLines(heading: string, items: readonly Item[]): PaneLine[] {
  if (items.length === 0) return [];
  const largest = [...items].sort((a, b) => b.tokens - a.tokens);
  const shown = largest.slice(0, LIST_CAP).map(
    (item): PaneLine => ({
      tone: 'plain',
      text: `${item.name}  ${tokensText(item.tokens)}`,
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

function usageLines(usage: UsageRead): PaneLine[] {
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
      (row): PaneLine => ({
        tone: 'plain',
        text: `${row.name}  ${tokensText(row.tokens)}`,
      }),
    );
  return [
    { tone: 'heading', text: 'CONTEXT' },
    ...used,
    ...itemLines(
      'AGENTS',
      breakdown.agents.map((a) => ({ name: a.agentType, tokens: a.tokens })),
    ),
    ...itemLines(
      'SKILLS',
      (breakdown.skills?.skillFrontmatter ?? []).map((s) => ({
        name: s.name,
        tokens: s.tokens,
      })),
    ),
    ...itemLines(
      'MEMORY FILES',
      breakdown.memoryFiles.map((m) => ({ name: m.path, tokens: m.tokens })),
    ),
  ];
}

/** The `/profile` pane: the profile, what it hides, and what loaded, each line cut to `columns`. */
export function profilePaneLines(
  input: { profile: string | undefined; hidden: Hidden; usage: UsageRead },
  columns: number,
): PaneLine[] {
  const lines: PaneLine[] = [
    { tone: 'heading', text: 'PROFILE' },
    input.profile === undefined
      ? { tone: 'muted', text: UNPROFILED }
      : { tone: 'plain', text: input.profile },
    ...hiddenLines(input.hidden),
    ...usageLines(input.usage),
  ];
  return lines.map((line) => ({ ...line, text: cut(line.text, columns) }));
}
