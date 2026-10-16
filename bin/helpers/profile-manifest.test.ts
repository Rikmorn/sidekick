import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isProfileName,
  parseManifest,
  readManifest,
} from './profile-manifest.js';

const issuesOf = (raw: unknown): string => {
  const r = parseManifest(raw);
  if (r.ok) throw new Error('expected a refusal');
  return r.issues.join('\n');
};

describe('parseManifest', () => {
  test('a description alone is a valid manifest', () => {
    expect(parseManifest({ description: 'Clean room' })).toEqual({
      ok: true,
      manifest: { description: 'Clean room' },
    });
  });
  test('every field together parses', () => {
    const raw = {
      description: 'x',
      settingSources: ['project', 'local'],
      settings: { enabledPlugins: { 'a@b': true } },
    };
    expect(parseManifest(raw)).toEqual({ ok: true, manifest: raw });
  });
  test('an unknown top-level key is refused, naming it', () => {
    expect(issuesOf({ description: 'x', stance: 'y' })).toContain('stance');
  });
  test('an empty description is refused', () => {
    expect(issuesOf({ description: '' })).toContain('description');
  });
  test('a missing description is refused', () => {
    expect(issuesOf({})).toContain('description');
  });
  test.each([
    [null],
    [[]],
    ['text'],
    [3],
  ])('a non-object root %p is refused', (raw) => {
    expect(parseManifest(raw).ok).toBe(false);
  });
  test('a settingSources value outside the three is refused', () => {
    expect(issuesOf({ description: 'x', settingSources: ['team'] })).toContain(
      'settingSources',
    );
  });
  test('a repeated settingSources value is refused', () => {
    expect(
      issuesOf({ description: 'x', settingSources: ['user', 'user'] }),
    ).toContain('repeat');
  });
  test('an empty settingSources array is valid', () => {
    expect(parseManifest({ description: 'x', settingSources: [] }).ok).toBe(
      true,
    );
  });
  test('hide holds both lists and parses', () => {
    const raw = {
      description: 'd',
      hide: { agents: ['Explore'], mods: ['desk'] },
    };
    expect(parseManifest(raw)).toEqual({ ok: true, manifest: raw });
  });
  test('a manifest without hide parses unchanged', () => {
    expect(parseManifest({ description: 'd' })).toEqual({
      ok: true,
      manifest: { description: 'd' },
    });
  });
  test('hide with an unknown key is refused, naming it', () => {
    expect(issuesOf({ description: 'd', hide: { skills: ['x'] } })).toContain(
      'skills',
    );
  });
  test('an unknown mod part is refused, naming it', () => {
    expect(issuesOf({ description: 'd', hide: { mods: ['gauge'] } })).toContain(
      'gauge',
    );
  });
  test('an empty agent name is refused', () => {
    expect(issuesOf({ description: 'd', hide: { agents: [''] } })).toContain(
      'hide.agents.0: must not be empty',
    );
  });
  test('a repeated hide entry is refused', () => {
    expect(
      issuesOf({ description: 'd', hide: { mods: ['desk', 'desk'] } }),
    ).toContain('hide.mods: must not repeat an entry');
    expect(
      issuesOf({ description: 'd', hide: { agents: ['a', 'a'] } }),
    ).toContain('hide.agents: must not repeat an entry');
  });
  test.each([
    ['Explore'],
    [{}],
    [null],
  ])('a non-list %p in hide.agents is refused', (agents) => {
    expect(issuesOf({ description: 'd', hide: { agents } })).toContain(
      'hide.agents',
    );
  });
  test('hide that is not an object is refused', () => {
    expect(issuesOf({ description: 'd', hide: ['desk'] })).toContain('hide');
  });
  test.each([
    [[]],
    ['text'],
    [null],
  ])('settings as %p is refused', (settings) => {
    expect(issuesOf({ description: 'x', settings })).toContain('settings');
  });
  test('settings may not hold the sidekick key launch owns', () => {
    expect(
      issuesOf({ description: 'x', settings: { sidekick: {} } }),
    ).toContain('sidekick');
  });
  test('nested unknown keys in settings pass through untouched', () => {
    const settings = { anything: { deep: [1, { z: null }] } };
    expect(parseManifest({ description: 'x', settings })).toEqual({
      ok: true,
      manifest: { description: 'x', settings },
    });
  });
  test('an issue reads "<path>: <message>", with (root) for the object itself', () => {
    expect(issuesOf({ description: 'x', settings: [] })).toMatch(
      /^settings: /m,
    );
    expect(issuesOf('text')).toMatch(/^\(root\): /m);
  });
});

describe('isProfileName', () => {
  test.each([
    'bench',
    'bench-clean',
    'a',
    '0x',
    'a'.repeat(64),
  ])('%p is a name', (n) => {
    expect(isProfileName(n)).toBe(true);
  });
  test.each([
    '',
    '-a',
    'Bench',
    'a_b',
    'a b',
    'a/b',
    '..',
    'a'.repeat(65),
    'a\n',
  ])('%p is not', (n) => {
    expect(isProfileName(n)).toBe(false);
  });
});

describe('readManifest', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-manifest-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a missing file reads "<path>: missing"', () => {
    const file = path.join(dir, 'profile.json');
    expect(readManifest(file)).toEqual({
      ok: false,
      issues: [`${file}: missing`],
    });
  });
  test('invalid JSON is refused with the path first', () => {
    const file = path.join(dir, 'profile.json');
    fs.writeFileSync(file, '{ nope');
    const r = readManifest(file);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toHaveLength(1);
      expect(r.issues[0]?.startsWith(`${file}: `)).toBe(true);
    }
  });
  test('a schema issue is prefixed with the path', () => {
    const file = path.join(dir, 'profile.json');
    fs.writeFileSync(file, JSON.stringify({ description: 'x', stance: 1 }));
    const r = readManifest(file);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      for (const i of r.issues) expect(i.startsWith(`${file}: `)).toBe(true);
      expect(r.issues.join('\n')).toContain('stance');
    }
  });
  test('a valid file returns the manifest', () => {
    const file = path.join(dir, 'profile.json');
    fs.writeFileSync(file, JSON.stringify({ description: 'Clean room' }));
    expect(readManifest(file)).toEqual({
      ok: true,
      manifest: { description: 'Clean room' },
    });
  });
  test('an unreadable path that is not missing is refused with the path first', () => {
    const r = readManifest(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.startsWith(`${dir}: `)).toBe(true);
  });
});
