import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * #74's regression gate: a frontmatter value must survive its reader.
 *
 * Claude Code's frontmatter reader is not a strict YAML parser. It truncates an
 * unquoted value at ` #` — comment behaviour — so a description mentioning
 * `## Architecture` silently loses everything after it, and the agent ships with
 * half a description. A `: ` inside an unquoted value is the mirror hazard: a
 * strict parser rejects the whole block as a nested mapping.
 *
 * Quoting the value defeats both. This walks the live tree rather than a
 * fixture, because the hazard arrives with the next agent someone writes. The
 * file list is derived from the directories (#56) so a new agent or skill is
 * covered the day it lands, and no count or filename is pinned here.
 */

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/** A value opening with one of these is quoted, block, or flow — already safe. */
const SAFE_OPENERS = ['"', "'", '>', '|', '[', '{'];

const KEY_VALUE = /^([A-Za-z0-9_-]+):\s*(.*)$/;

const HAZARDS: ReadonlyArray<readonly [string, string]> = [
  [' #', 'truncates at a comment marker'],
  [': ', 'is rejected as a nested mapping'],
];

const agentFiles = (): string[] =>
  fs
    .readdirSync(path.join(REPO_ROOT, 'agents'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join('agents', name))
    .sort();

const skillFiles = (): string[] =>
  fs
    .readdirSync(path.join(REPO_ROOT, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join('skills', entry.name, 'SKILL.md'))
    .filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)))
    .sort();

const frontmatterLines = (rel: string): string[] => {
  const lines = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').split('\n');
  if (lines[0]?.trim() !== '---') return [];
  const closeAt = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  return closeAt > 0 ? lines.slice(1, closeAt) : [];
};

const hasDelimiters = (rel: string): boolean => {
  const lines = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').split('\n');
  if (lines[0]?.trim() !== '---') return false;
  return lines.findIndex((line, i) => i > 0 && line.trim() === '---') > 0;
};

const hazardsIn = (rel: string): string[] => {
  const found: string[] = [];
  for (const line of frontmatterLines(rel)) {
    const match = KEY_VALUE.exec(line);
    if (!match) continue;
    const key = match[1];
    const value = match[2];
    if (!value || SAFE_OPENERS.includes(value[0])) continue;
    for (const [needle, label] of HAZARDS) {
      if (value.includes(needle)) {
        found.push(`${rel} — unquoted '${key}' ${label} ('${needle}')`);
      }
    }
  }
  return found;
};

describe('frontmatter hazards (#74)', () => {
  it('finds frontmatter files in both agents/ and skills/', () => {
    // A broken glob must fail loudly, not pass vacuously over an empty list.
    expect(agentFiles().length).toBeGreaterThan(0);
    expect(skillFiles().length).toBeGreaterThan(0);
  });

  it('every file opens and closes its frontmatter block', () => {
    const missing = [...agentFiles(), ...skillFiles()].filter(
      (rel) => !hasDelimiters(rel),
    );
    expect(missing).toEqual([]);
  });

  it('no unquoted value carries a hazard the reader mishandles', () => {
    const hazards = [...agentFiles(), ...skillFiles()].flatMap(hazardsIn);
    expect(hazards).toEqual([]);
  });
});
