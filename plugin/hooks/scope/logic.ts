// The scope mod's pure logic: what a session's flag settings hide. No engine
// calls, so the tests reach it directly.

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
