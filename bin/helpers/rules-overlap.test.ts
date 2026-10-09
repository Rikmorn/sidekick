import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findOverlap, formatOverlap } from './rules-overlap.js';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sk-overlap-'));
}
function write(dir: string, name: string, body: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
}

const SK_TS =
  '# TypeScript\n\nAssumes strict mode is on.\n\n## Parse at boundaries\n\nx\n\n## Idiomatic code\n\ny\n';
const SK_LANG =
  '# Language\n\nWrite in British English.\n\n## Structure\n\nProse for argument.\n\n## Voice\n\nBe direct.\n';

function setup(): { src: string; dest: string } {
  const src = tmp();
  write(src, 'sk-typescript.md', SK_TS);
  write(src, 'sk-language.md', SK_LANG);
  return { src, dest: tmp() };
}

describe('findOverlap', () => {
  test('a same-named rewrite with no shared heading or opening pairs on name', () => {
    const { src, dest } = setup();
    write(
      dest,
      'typescript.md',
      '# TS\n\nOur own rules.\n\nNo headings here.\n',
    );
    expect(findOverlap(src, dest)).toEqual({
      pairs: [
        { file: 'typescript.md', rule: 'sk-typescript.md', signals: ['name'] },
      ],
      extensions: [],
    });
  });

  test('one shared generic heading alone is not overlap', () => {
    const { src, dest } = setup();
    write(dest, 'testing.md', '# Testing\n\nRun them.\n\n## Structure\n\nz\n');
    expect(findOverlap(src, dest)).toEqual({ pairs: [], extensions: [] });
  });

  test('a heading repeated in one file counts once', () => {
    const { src, dest } = setup();
    write(
      dest,
      'testing.md',
      '# Testing\n\nRun them.\n\n## Structure\n\nz\n\n## Structure\n\nzz\n',
    );
    expect(findOverlap(src, dest)).toEqual({ pairs: [], extensions: [] });
  });

  test('two shared headings pair, with their count', () => {
    const { src, dest } = setup();
    write(
      dest,
      'notes.md',
      '# Notes\n\nMine.\n\n## Parse at boundaries\n\na\n\n## Idiomatic code\n\nb\n',
    );
    expect(findOverlap(src, dest).pairs).toEqual([
      {
        file: 'notes.md',
        rule: 'sk-typescript.md',
        signals: [{ headings: 2 }],
      },
    ]);
  });

  test('a shared opening sentence pairs, frontmatter skipped', () => {
    const { src, dest } = setup();
    write(dest, 'style.md', '# Style\n\nWrite in British English.\n');
    write(
      dest,
      'scoped.md',
      '---\npaths:\n  - "src/**"\n---\n\n# Scoped\n\nWrite in British English. Always.\n',
    );
    const opening = { opening: 'write in british english' };
    expect(findOverlap(src, dest).pairs).toEqual([
      { file: 'scoped.md', rule: 'sk-language.md', signals: [opening] },
      { file: 'style.md', rule: 'sk-language.md', signals: [opening] },
    ]);
  });

  test('a file that names its pair is a stated extension, not a pair', () => {
    const { src, dest } = setup();
    write(
      dest,
      'typescript.md',
      '# TS\n\nExtends `sk-typescript.md` with our own.\n',
    );
    expect(findOverlap(src, dest)).toEqual({
      pairs: [],
      extensions: [{ file: 'typescript.md', rule: 'sk-typescript.md' }],
    });
  });

  test('naming a different sk rule leaves the pair reported', () => {
    const { src, dest } = setup();
    write(dest, 'language.md', '# Lang\n\nOurs.\n\nSee sk-typescript.md.\n');
    expect(findOverlap(src, dest)).toEqual({
      pairs: [
        { file: 'language.md', rule: 'sk-language.md', signals: ['name'] },
      ],
      extensions: [],
    });
  });

  test('naming an sk rule with no signal is neither pair nor extension', () => {
    const { src, dest } = setup();
    write(
      dest,
      'odin-conventions.md',
      '# Odin\n\nHouse style.\n\nBuilds on sk-typescript.md.\n',
    );
    expect(findOverlap(src, dest)).toEqual({ pairs: [], extensions: [] });
  });

  test('sk-*.md and non-.md files in dest are ignored', () => {
    const { src, dest } = setup();
    write(dest, 'sk-typescript.md', SK_TS);
    write(dest, 'language.txt', SK_LANG);
    expect(findOverlap(src, dest)).toEqual({ pairs: [], extensions: [] });
  });

  test('a missing dest reports nothing', () => {
    const { src } = setup();
    expect(findOverlap(src, path.join(tmp(), 'absent'))).toEqual({
      pairs: [],
      extensions: [],
    });
  });
});

describe('formatOverlap', () => {
  const remedy =
    'overlap is reported only; sidekick never edits files it does not own. If a repo file extends or departs from its pair on purpose, name the sk rule in it and the pair moves to the stated extensions';

  test('renders pairs, the remedy line, and extensions', () => {
    expect(
      formatOverlap({
        pairs: [
          {
            file: 'clean-code.md',
            rule: 'sk-clean-code.md',
            signals: ['name', { headings: 8 }, { opening: 'x' }],
          },
        ],
        extensions: [
          { file: 'typescript.md', rule: 'sk-typescript.md' },
          { file: 'working-standards.md', rule: 'sk-working-standards.md' },
        ],
      }),
    ).toEqual([
      'clean-code.md overlaps sk-clean-code.md on name, 8 headings, opening',
      remedy,
      'stated extensions, not reported: typescript.md → sk-typescript.md, working-standards.md → sk-working-standards.md',
    ]);
  });

  test('renders the empty case, with extensions still summarised', () => {
    const none =
      'no overlap found (checked file names, two or more shared H2 headings, and the opening sentence against non-sk-*.md files)';
    expect(formatOverlap({ pairs: [], extensions: [] })).toEqual([none]);
    expect(
      formatOverlap({
        pairs: [],
        extensions: [{ file: 'a.md', rule: 'sk-a.md' }],
      }),
    ).toEqual([none, 'stated extensions, not reported: a.md → sk-a.md']);
  });
});
