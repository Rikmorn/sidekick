import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseCron } from './loop-cron.js';
import {
  CLASS_STATES,
  LOOP_FILE,
  parseLoopManifest,
  readLoopManifest,
} from './loop-manifest.js';

const example = () => ({
  description: 'Fix bugs filed in sidekick',
  repo: '/Users/someone/Documents/Projects/sidekick',
  profile: 'fixer',
  schedule: '7 * * * *',
  tick: '/fixer:tick',
  hosts: ['registry.npmjs.org'],
  gates: ['bun run test', 'bun run typecheck'],
  caps: {
    attemptsPerUnit: 2,
    workMinutesPerUnit: 180,
    waitMinutesPerUnit: 1440,
    unitsPerDay: 4,
    failedUnitsInARow: 3,
  },
  mandate: {
    reads: ['Bash(gh issue view *)', 'Bash(gh issue list *)'],
    classes: {
      triage: {
        state: 'record',
        allow: ['Bash(gh issue edit * --add-label *)'],
      },
      integrate: { state: 'ask', allow: ['Bash(sidekick loop land fixer *)'] },
    },
    never: ['Bash(git push --force *)'],
  },
});

type Json = Record<string, unknown>;
const change = (edit: (m: Json) => void): unknown => {
  const m: Json = example();
  edit(m);
  return m;
};
const asObj = (m: Json, key: string): Json => {
  const x = m[key];
  if (typeof x !== 'object' || x === null) throw new Error(`no ${key}`);
  return Object.fromEntries(Object.entries(x));
};

const issuesOf = (raw: unknown): string[] => {
  const r = parseLoopManifest(raw);
  if (r.ok) throw new Error('expected a refusal');
  return r.issues;
};

describe('parseLoopManifest', () => {
  test('the spec example parses', () => {
    expect(parseLoopManifest(example()).ok).toBe(true);
  });

  test('names the file and the class states', () => {
    expect(LOOP_FILE).toBe('loop.json');
    expect([...CLASS_STATES]).toEqual(['record', 'ask', 'act']);
  });

  test('a key refuses with its path', () => {
    const cases: [string, (m: Json) => void][] = [
      ['description', (m) => (m.description = '')],
      ['repo', (m) => (m.repo = 'relative/path')],
      ['profile', (m) => (m.profile = 'Bad Name')],
      ['schedule', (m) => (m.schedule = 'nope')],
      ['tick', (m) => (m.tick = 'fixer:tick')],
      ['hosts.0', (m) => (m.hosts = ['exa mple.com'])],
      ['gates', (m) => delete m.gates],
      [
        'caps.unitsPerDay',
        (m) => (m.caps = { ...asObj(m, 'caps'), unitsPerDay: 0 }),
      ],
      [
        'mandate.reads.0',
        (m) => (m.mandate = { ...asObj(m, 'mandate'), reads: [''] }),
      ],
      [
        'mandate.never.0',
        (m) => (m.mandate = { ...asObj(m, 'mandate'), never: [''] }),
      ],
    ];
    for (const [key, edit] of cases) {
      expect(issuesOf(change(edit)).some((i) => i.startsWith(`${key}: `))).toBe(
        true,
      );
    }
  });

  test('an unknown key refuses at the root, in caps, in mandate, and in a class', () => {
    const roots: [string, (m: Json) => void][] = [
      ['extra', (m) => (m.extra = 1)],
      ['caps.extra', (m) => (m.caps = { ...asObj(m, 'caps'), extra: 1 })],
      [
        'mandate.extra',
        (m) => (m.mandate = { ...asObj(m, 'mandate'), extra: 1 }),
      ],
      [
        'mandate.classes.triage.extra',
        (m) => {
          const mandate = asObj(m, 'mandate');
          mandate.classes = {
            triage: { state: 'record', allow: ['Bash(x *)'], extra: 1 },
          };
          m.mandate = mandate;
        },
      ],
    ];
    for (const [key, edit] of roots) {
      expect(issuesOf(change(edit)).some((i) => i.startsWith(`${key}: `))).toBe(
        true,
      );
    }
  });

  test.each([
    'attemptsPerUnit',
    'workMinutesPerUnit',
    'unitsPerDay',
    'failedUnitsInARow',
  ])('caps.%s is required', (cap) => {
    const raw = change((m) => {
      const caps = asObj(m, 'caps');
      delete caps[cap];
      m.caps = caps;
    });
    expect(issuesOf(raw).some((i) => i.startsWith(`caps.${cap}: `))).toBe(true);
  });

  test('waitMinutesPerUnit may be absent', () => {
    const raw = change((m) => {
      const caps = asObj(m, 'caps');
      delete caps.waitMinutesPerUnit;
      m.caps = caps;
    });
    expect(parseLoopManifest(raw).ok).toBe(true);
  });

  test.each([0, 1.5, -1])('a cap of %p refuses', (n) => {
    const raw = change(
      (m) => (m.caps = { ...asObj(m, 'caps'), attemptsPerUnit: n }),
    );
    expect(
      issuesOf(raw).some((i) => i.startsWith('caps.attemptsPerUnit: ')),
    ).toBe(true);
  });

  test('gates may be empty, and a missing gates refuses', () => {
    expect(parseLoopManifest(change((m) => (m.gates = []))).ok).toBe(true);
    expect(issuesOf(change((m) => delete m.gates)).length).toBeGreaterThan(0);
  });

  test('hosts defaults to an empty list', () => {
    const r = parseLoopManifest(change((m) => delete m.hosts));
    expect(r.ok && r.manifest.hosts).toEqual([]);
  });

  test('hosts take a leading wildcard label', () => {
    expect(
      parseLoopManifest(change((m) => (m.hosts = ['*.example.com']))).ok,
    ).toBe(true);
    expect(issuesOf(change((m) => (m.hosts = ['exa mple.com'])))[0]).toContain(
      'hosts.0',
    );
    expect(parseLoopManifest(change((m) => (m.hosts = ['localhost']))).ok).toBe(
      false,
    );
  });

  test('a class name follows the profile name rule', () => {
    const raw = change((m) => {
      m.mandate = {
        ...asObj(m, 'mandate'),
        classes: { Fix: { state: 'act', allow: ['Bash(x *)'] } },
      };
    });
    expect(issuesOf(raw).some((i) => i.startsWith('mandate.classes'))).toBe(
      true,
    );
  });

  test('a class needs a non-empty allow list and a known state', () => {
    const withClass = (cls: unknown) =>
      change((m) => {
        m.mandate = { ...asObj(m, 'mandate'), classes: { fix: cls } };
      });
    expect(
      issuesOf(withClass({ state: 'act', allow: [] })).some((i) =>
        i.startsWith('mandate.classes.fix.allow'),
      ),
    ).toBe(true);
    expect(
      issuesOf(withClass({ state: 'go', allow: ['Bash(x *)'] })).some((i) =>
        i.startsWith('mandate.classes.fix.state'),
      ),
    ).toBe(true);
  });

  test('tick takes a plugin-qualified or bare skill, with arguments', () => {
    for (const ok of ['/tick', '/fixer:tick', '/fixer:tick --fast now']) {
      expect(parseLoopManifest(change((m) => (m.tick = ok))).ok).toBe(true);
    }
    for (const bad of ['fixer:tick', '/', '/fixer:', '/-a', '']) {
      expect(parseLoopManifest(change((m) => (m.tick = bad))).ok).toBe(false);
    }
  });

  test('repo must be absolute', () => {
    expect(issuesOf(change((m) => (m.repo = 'relative/path')))[0]).toContain(
      'repo: ',
    );
  });

  test('schedule refuses with the cron reader own issue', () => {
    const own = parseCron('@hourly');
    if (own.ok) throw new Error('expected parseCron to refuse');
    const issues = issuesOf(change((m) => (m.schedule = '@hourly')));
    expect(issues).toContain(`schedule: ${own.issue}`);
  });

  test('a non-object refuses at the root', () => {
    expect(issuesOf('x')[0]).toStartWith('(root): ');
  });
});

describe('readLoopManifest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-manifest-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('reads a valid file', () => {
    const file = path.join(dir, 'ok.json');
    fs.writeFileSync(file, JSON.stringify(example()));
    expect(readLoopManifest(file).ok).toBe(true);
  });

  test('a missing file is an issue that starts with the path', () => {
    const file = path.join(dir, 'absent.json');
    const r = readLoopManifest(file);
    expect(r).toEqual({ ok: false, issues: [`${file}: missing`] });
  });

  test('an unreadable file is an issue', () => {
    const r = readLoopManifest(dir);
    expect(!r.ok && r.issues[0]?.startsWith(`${dir}: `)).toBe(true);
  });

  test('a JSON syntax error is an issue', () => {
    const file = path.join(dir, 'bad.json');
    fs.writeFileSync(file, '{');
    const r = readLoopManifest(file);
    expect(!r.ok && r.issues[0]?.startsWith(`${file}: invalid JSON: `)).toBe(
      true,
    );
  });

  test('schema issues start with the path', () => {
    const file = path.join(dir, 'schema.json');
    fs.writeFileSync(file, JSON.stringify({ ...example(), extra: 1 }));
    const r = readLoopManifest(file);
    expect(!r.ok && r.issues.every((i) => i.startsWith(`${file}: `))).toBe(
      true,
    );
  });
});
