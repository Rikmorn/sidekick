import type { ContextCategory, SessionContextBreakdown } from 'claude-code';
import { expect, test } from 'claude-code/testing';
import { UNPROFILED } from '../gauge/logic';
import {
  type Hidden,
  hiddenOf,
  isOffered,
  isPartHidden,
  type PaneLine,
  type Places,
  profilePaneLines,
  tokensText,
  type UsageRead,
} from './logic';

function hiding(hide: unknown): Record<string, unknown> {
  return { sidekick: { hide } };
}

test('settings without a hide key hide nothing', () => {
  for (const flag of [{}, { sidekick: { profile: 'p' } }, { sidekick: 'x' }]) {
    const hidden = hiddenOf(flag);
    expect(hidden.agents.size).toBe(0);
    expect(hidden.mods.size).toBe(0);
  }
});

test('a well-formed hide key hides the agents and mod parts it names', () => {
  const flag = hiding({ agents: ['Explore'], mods: ['desk'] });
  const hidden = hiddenOf(flag);
  expect([...hidden.agents]).toEqual(['Explore']);
  expect([...hidden.mods]).toEqual(['desk']);
  expect(isPartHidden(flag, 'desk')).toBe(true);
  expect(isPartHidden(flag, 'board')).toBe(false);
});

test('a malformed list hides nothing for that list and never throws', () => {
  const cases: unknown[] = [
    { agents: 'Explore', mods: 'desk' },
    { agents: [1], mods: [2] },
    { agents: [], mods: ['gauge'] },
    null,
    ['desk'],
    'desk',
  ];
  for (const hide of cases) {
    const hidden = hiddenOf(hiding(hide));
    expect(hidden.agents.size).toBe(0);
    expect(hidden.mods.size).toBe(0);
    expect(isPartHidden(hiding(hide), 'desk')).toBe(false);
  }
});

test('one bad entry leaves the good ones in the same list hidden', () => {
  const hidden = hiddenOf(
    hiding({ agents: ['Explore', 3, 'Plan'], mods: ['gauge', 'board'] }),
  );
  expect([...hidden.agents]).toEqual(['Explore', 'Plan']);
  expect([...hidden.mods]).toEqual(['board']);
});

test('an agent is withheld only on an exact name match', () => {
  const hidden = hiddenOf(hiding({ agents: ['Explore'] }));
  expect(isOffered(hidden, 'Explore')).toBe(false);
  expect(isOffered(hidden, 'explore')).toBe(true);
  expect(isOffered(hidden, 'Plan')).toBe(true);
});

const NOTHING: Hidden = { agents: new Set(), mods: new Set() };
const NOWHERE: Places = { session: undefined, home: undefined };

function row(
  name: string,
  tokens: number,
  kind: ContextCategory['kind'],
): ContextCategory {
  return { name, tokens, color: 'text', isDeferred: kind === 'deferred', kind };
}

function breakdown(
  over: Partial<SessionContextBreakdown> = {},
): SessionContextBreakdown {
  return {
    categories: [],
    totalTokens: 0,
    maxTokens: 1_000_000,
    rawMaxTokens: 1_000_000,
    autocompactSource: 'auto',
    percentage: 0,
    gridRows: [],
    model: 'm',
    memoryFiles: [],
    mcpTools: [],
    agents: [],
    isAutoCompactEnabled: true,
    apiUsage: null,
    ...over,
  };
}

function ok(over: Partial<SessionContextBreakdown> = {}): UsageRead {
  return { ok: true, breakdown: breakdown(over) };
}

function texts(lines: PaneLine[]): string[] {
  return lines.map((line) => line.text);
}

test('an unprofiled session says so and hides nothing', () => {
  const lines = profilePaneLines(
    { profile: undefined, hidden: NOTHING, usage: ok(), places: NOWHERE },
    80,
  );
  expect(lines.slice(0, 3)).toEqual([
    { tone: 'heading', text: 'PROFILE' },
    { tone: 'muted', text: UNPROFILED },
    { tone: 'muted', text: 'hides nothing' },
  ]);
});

test('a profile names itself and lists what it hides', () => {
  const hidden = hiddenOf(
    hiding({ agents: ['Explore', 'Plan'], mods: ['desk'] }),
  );
  const lines = profilePaneLines(
    { profile: 'worker', hidden, usage: ok(), places: NOWHERE },
    80,
  );
  expect(texts(lines).slice(0, 4)).toEqual([
    'PROFILE',
    'worker',
    'hides agents: Explore, Plan',
    'hides mod parts: desk',
  ]);
});

test('only used rows print, in the engine’s order and whatever their names', () => {
  const usage = ok({
    categories: [
      row('Messages', 1_234, 'used'),
      row('System prompt', 640, 'used'),
      row('Free space', 900_000, 'free'),
      row('Autocompact buffer', 33_000, 'buffer'),
      row('MCP tools (deferred)', 5_000, 'deferred'),
      row('Custom row', 12_000, 'used'),
    ],
  });
  const lines = profilePaneLines(
    { profile: undefined, hidden: NOTHING, usage, places: NOWHERE },
    80,
  );
  expect(texts(lines).slice(3)).toEqual([
    'CONTEXT',
    'Messages  1.2k',
    'System prompt  640',
    'Custom row  12.0k',
  ]);
});

test('each list is largest first, capped at five, with the rest counted', () => {
  const agents = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((agentType, i) => ({
    agentType,
    source: 'plugin',
    tokens: (i + 1) * 100,
  }));
  const lines = profilePaneLines(
    {
      profile: undefined,
      hidden: NOTHING,
      usage: ok({ agents }),
      places: NOWHERE,
    },
    80,
  );
  expect(texts(lines).slice(4)).toEqual([
    'AGENTS',
    'g  700',
    'f  600',
    'e  500',
    'd  400',
    'c  300',
    '+2 more',
  ]);
});

test('skills and memory files list the same way, and empty lists are left out', () => {
  const lines = profilePaneLines(
    {
      profile: undefined,
      hidden: NOTHING,
      usage: ok({
        skills: {
          totalSkills: 2,
          includedSkills: 2,
          tokens: 300,
          skillFrontmatter: [
            { name: 'small', source: 'plugin', tokens: 100 },
            { name: 'big', source: 'plugin', tokens: 200 },
          ],
        },
        memoryFiles: [{ path: '/p/CLAUDE.md', type: 'Project', tokens: 2_500 }],
      }),
      places: NOWHERE,
    },
    80,
  );
  expect(texts(lines).slice(4)).toEqual([
    'SKILLS',
    'big  200',
    'small  100',
    'MEMORY FILES',
    '/p/CLAUDE.md  2.5k',
  ]);
});

test('the pane sums nothing: no total line appears', () => {
  const lines = profilePaneLines(
    {
      profile: undefined,
      hidden: NOTHING,
      usage: ok({ totalTokens: 99_999, categories: [row('A', 10, 'used')] }),
      places: NOWHERE,
    },
    80,
  );
  expect(texts(lines).join('\n')).not.toMatch(/total|99\.9k|100\.0k/i);
});

test('a failed read draws one failure line in place of the context', () => {
  const lines = profilePaneLines(
    {
      profile: 'worker',
      hidden: NOTHING,
      usage: { ok: false, reason: 'refused' },
      places: NOWHERE,
    },
    80,
  );
  expect(lines.filter((line) => line.tone === 'failure')).toEqual([
    { tone: 'failure', text: 'context usage could not be read: refused' },
  ]);
  expect(texts(lines)).not.toContain('CONTEXT');
  expect(texts(lines)).toContain('worker');
});

test('every line is cut to the columns, by code point', () => {
  const usage = ok({ categories: [row('Messages — long', 1_000, 'used')] });
  const lines = profilePaneLines(
    { profile: 'a—profile…name', hidden: NOTHING, usage, places: NOWHERE },
    10,
  );
  for (const line of lines) {
    expect([...line.text].length).toBeLessThanOrEqual(10);
  }
  expect(texts(lines)).toContain('a—profile…');
});

const LONG_PATH =
  '/Users/someone/Documents/Projects/a-long-repository-name/.claude/rules/house-style.md';

function memoryPane(
  paths: readonly string[],
  columns: number,
  places: Places = NOWHERE,
): string[] {
  const memoryFiles = paths.map((path) => ({
    path,
    type: 'Project',
    tokens: 2_500,
  }));
  const lines = profilePaneLines(
    { profile: undefined, hidden: NOTHING, usage: ok({ memoryFiles }), places },
    columns,
  );
  // Memory files are the last list, and a narrow pane cuts their heading.
  const start = lines.findLastIndex((line) => line.tone === 'heading') + 1;
  return texts(lines.slice(start));
}

test('a long memory file path keeps its figure and its end within the columns', () => {
  const [line = ''] = memoryPane([LONG_PATH], 40);
  expect([...line].length).toBeLessThanOrEqual(40);
  expect(line).toEndWith('house-style.md  2.5k');
  expect(line).toStartWith('…');
  expect(memoryPane([LONG_PATH], 7)).toEqual(['…  2.5k']);
  expect(memoryPane([LONG_PATH], 5)).toEqual(['2.5k']);
});

test('a path under the session folder prints relative to it, and one under home with ~', () => {
  const places: Places = { session: '/work/repo', home: '/home/me' };
  expect(
    memoryPane(
      [
        '/work/repo/CLAUDE.md',
        '/home/me/.claude/CLAUDE.md',
        '/work/repo-two/CLAUDE.md',
        '/etc/claude/CLAUDE.md',
      ],
      80,
      places,
    ),
  ).toEqual([
    'CLAUDE.md  2.5k',
    '~/.claude/CLAUDE.md  2.5k',
    '/work/repo-two/CLAUDE.md  2.5k',
    '/etc/claude/CLAUDE.md  2.5k',
  ]);
});

test('an empty folder shortens nothing', () => {
  expect(
    memoryPane(['/home/me/CLAUDE.md'], 80, { session: '', home: '' }),
  ).toEqual(['/home/me/CLAUDE.md  2.5k']);
});

test('a long agent, skill, or context row name keeps its figure', () => {
  const name = 'an-agent-with-a-very-long-name-indeed';
  const lines = profilePaneLines(
    {
      profile: undefined,
      hidden: NOTHING,
      usage: ok({
        categories: [row(name, 1_234, 'used')],
        agents: [{ agentType: name, source: 'plugin', tokens: 321 }],
        skills: {
          totalSkills: 1,
          includedSkills: 1,
          tokens: 100,
          skillFrontmatter: [{ name, source: 'plugin', tokens: 100 }],
        },
      }),
      places: NOWHERE,
    },
    20,
  );
  expect(texts(lines)).toEqual(
    expect.arrayContaining([
      'an-agent-with-  1.2k',
      'an-agent-with-a  321',
      'an-agent-with-a  100',
    ]),
  );
});

test('a pane with no columns, or fewer than none, has no lines', () => {
  for (const columns of [0, -4]) {
    expect(memoryPane([LONG_PATH], columns)).toEqual([]);
    expect(
      profilePaneLines(
        { profile: 'p', hidden: NOTHING, usage: ok(), places: NOWHERE },
        columns,
      ),
    ).toEqual([]);
  }
});

test('tokens print whole below 1,000 and as thousands to one decimal from there', () => {
  expect(tokensText(0)).toBe('0');
  expect(tokensText(999)).toBe('999');
  expect(tokensText(999.6)).toBe('1.0k');
  expect(tokensText(1_000)).toBe('1.0k');
  expect(tokensText(1_249)).toBe('1.2k');
  expect(tokensText(1_250)).toBe('1.3k');
  expect(tokensText(1_234_567)).toBe('1234.6k');
});
