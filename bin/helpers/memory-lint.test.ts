import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readSection } from './hook.js';
import {
  type LintDeps,
  lintStore,
  MEMORY_LINT_IDS,
  type MemoryFinding,
  STORE_WIDE_IDS,
} from './memory-lint.js';
import { writeMarker } from './memory-store.js';
import { execRunner } from './pm-data.js';

let tmp = '';
let store = '';
// Files a test made unreadable, restored before the folder is removed.
let locked: string[] = [];

const SECTIONS = '## State\n\nNow.\n\n## Next steps\n\nThen.\n';

function workstream(name: string, status: string, body = SECTIONS): string {
  return `---\nname: ${name}\ndescription: about ${name}\nmetadata:\n  kind: workstream\n  status: ${status}\n---\n\n${body}`;
}

function reference(name: string, body = ''): string {
  return `---\nname: ${name}\ndescription: about ${name}\nmetadata:\n  type: reference\n---\n\n# ${name}\n${body}`;
}

const SESSION_RECORD =
  '---\nname: record\ndescription: a session\nmetadata:\n  kind: session\n  session: abc\n  workstream: alpha\n---\n\n# Did a thing\n';

const PROJ_INDEX = [
  '# Memory Index',
  '',
  '- [alpha](alpha.md) — the open workstream',
  '- [Reference](reference.md) — facts that outlast workstreams',
  '- [Archive](archive.md) — closed workstreams',
];

function write(rel: string, text: string): string {
  const file = path.join(store, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function append(rel: string, text: string): void {
  fs.appendFileSync(path.join(store, rel), text);
}

function repoFolder(rel: string): void {
  const folder = path.join(store, rel);
  fs.mkdirSync(folder, { recursive: true });
  writeMarker(folder, path.join(tmp, 'repos', path.basename(rel)));
}

// One repo folder, one family folder with a nested repo folder, the reserved
// folders, a stray folder, and a dot folder: every place the lint must read or skip.
function cleanStore(): void {
  write('README.md', '# Memory store\n');
  write('sources/notes.md', '[gone](gone.md)\n');
  write('archive/old.md', 'No front matter, linked from nowhere.\n');
  write('stray/loose.md', 'No front matter, linked from nowhere.\n');
  write('.hidden/x.md', '[gone](gone.md)\n');
  repoFolder('proj');
  write('proj/MEMORY.md', `${PROJ_INDEX.join('\n')}\n`);
  write('proj/alpha.md', workstream('alpha', 'open'));
  write('proj/reference.md', reference('reference'));
  write('proj/archive.md', reference('archive', '\n- [beta](beta.md)\n'));
  write('proj/beta.md', workstream('beta', 'closed'));
  write('proj/sessions/2026-11-01-abc.md', SESSION_RECORD);
  write(
    'fam/MEMORY.md',
    '# Family\n\n- [shared](shared.md) — the family workstream\n- [repo](repo/MEMORY.md) — the repo index\n',
  );
  write('fam/shared.md', workstream('shared', 'open'));
  repoFolder('fam/repo');
  write('fam/repo/MEMORY.md', '# Repo\n\n- [gamma](gamma.md)\n');
  write('fam/repo/gamma.md', workstream('gamma', 'open'));
}

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mem-lint-')));
  store = path.join(tmp, 'store');
  locked = [];
  cleanStore();
});

afterEach(() => {
  for (const file of locked) fs.chmodSync(file, 0o644);
  fs.rmSync(tmp, { recursive: true, force: true });
});

function deps(): LintDeps {
  return {
    readSection,
    runGit: execRunner,
    home: path.join(tmp, 'home'),
    env: {},
    now: () => Date.now(),
  };
}

function lint(folders?: string[]) {
  return lintStore(store, deps(), folders === undefined ? {} : { folders });
}

function ids(findings: MemoryFinding[]): string[] {
  return findings.map((finding) => finding.id);
}

function at(rel: string): string {
  return path.join(store, rel);
}

function lock(rel: string): void {
  const file = at(rel);
  fs.chmodSync(file, 0o000);
  locked.push(file);
}

describe('lintStore on a clean store', () => {
  test('reports nothing', () => {
    expect(lint()).toEqual({ findings: [], counts: {} });
  });

  test('the ids are unique and the store-wide ones are among them', () => {
    expect(new Set(MEMORY_LINT_IDS).size).toBe(MEMORY_LINT_IDS.length);
    expect(STORE_WIDE_IDS.every((id) => MEMORY_LINT_IDS.includes(id))).toBe(
      true,
    );
  });
});

describe('dead-link', () => {
  test('a link in MEMORY.md to a missing file', () => {
    append('proj/MEMORY.md', '- [gone](gone.md) — missing\n');
    expect(lint().findings).toEqual([
      {
        id: 'dead-link',
        folder: 'proj',
        file: at('proj/MEMORY.md'),
        line: 6,
        message: 'links to gone.md, which does not exist',
      },
    ]);
  });

  test('a link in a file the index reaches', () => {
    append('proj/archive.md', '- [lost](lost.md)\n');
    const { findings } = lint();
    expect(ids(findings)).toEqual(['dead-link']);
    expect(findings[0]?.file).toBe(at('proj/archive.md'));
  });

  test('a link leaving the folder is checked for existence only', () => {
    append(
      'proj/MEMORY.md',
      '- [family](../fam/shared.md)\n- [nowhere](../fam/nowhere.md)\n',
    );
    const { findings } = lint();
    expect(ids(findings)).toEqual(['dead-link']);
    expect(findings[0]?.message).toBe(
      'links to ../fam/nowhere.md, which does not exist',
    );
  });

  test('an absolute link is checked for existence only', () => {
    append(
      'proj/MEMORY.md',
      `- [here](${at('fam/shared.md')})\n- [there](${at('fam/none.md')})\n`,
    );
    const { findings } = lint();
    expect(ids(findings)).toEqual(['dead-link']);
    expect(findings[0]?.line).toBe(7);
  });

  test('a dead link in a file no index reaches is left to unindexed', () => {
    write('proj/loose.md', reference('loose', '[lost](lost.md)\n'));
    expect(ids(lint().findings)).toEqual(['unindexed']);
  });

  test('links that are not file targets are not dead', () => {
    write('proj/a b.md', reference('spaced'));
    append(
      'proj/MEMORY.md',
      [
        '- [site](https://example.com/gone.md)',
        '- [mail](mailto:someone@example.com)',
        '- [part](reference.md#part)',
        '- [titled](reference.md "Reference")',
        '- [spaced](<a b.md>)',
        '- [anchor](#top)',
        '',
      ].join('\n'),
    );
    expect(lint().findings).toEqual([]);
  });

  test('a link inside fenced code is not checked, and the fence closes', () => {
    append(
      'proj/MEMORY.md',
      '\n```\n- [gone](gone.md)\n```\n- [after](after.md)\n',
    );
    const { findings } = lint();
    expect(ids(findings)).toEqual(['dead-link']);
    expect(findings[0]?.line).toBe(10);
  });

  test('a link inside a code span is not checked', () => {
    append('proj/MEMORY.md', '- Write links as `[text](gone.md)`.\n');
    expect(lint().findings).toEqual([]);
  });
});

describe('unindexed', () => {
  test('a top-level file no link reaches', () => {
    write('proj/orphan.md', reference('orphan'));
    expect(lint().findings).toEqual([
      {
        id: 'unindexed',
        folder: 'proj',
        file: at('proj/orphan.md'),
        message:
          'no link from MEMORY.md reaches it, directly or through other files',
      },
    ]);
  });

  test('a folder without MEMORY.md leaves each of its files unindexed', () => {
    fs.rmSync(at('proj/MEMORY.md'));
    const { findings } = lint();
    expect(ids(findings)).toEqual([
      'unindexed',
      'unindexed',
      'unindexed',
      'unindexed',
    ]);
    expect(findings[0]?.message).toBe('the folder has no MEMORY.md to link it');
  });

  test("a family folder's checks stop at its repo folders", () => {
    write('fam/repo/orphan.md', reference('orphan'));
    append('fam/repo/MEMORY.md', '- [gone](gone.md)\n');
    const found = lint().findings.map((finding) => [
      finding.id,
      finding.folder,
    ]);
    expect(found).toEqual([
      ['dead-link', 'fam/repo'],
      ['unindexed', 'fam/repo'],
    ]);
  });
});

describe('index-over-cap', () => {
  function indexOfLines(count: number, width = 10): string {
    const line = `- ${'x'.repeat(width - 2)}`;
    return `${Array.from({ length: count }, () => line).join('\n')}\n`;
  }

  // Each index keeps its links, so only the size changes.
  function bigIndex(count: number, width?: number): void {
    const links = PROJ_INDEX.slice(2);
    write(
      'proj/MEMORY.md',
      `${links.join('\n')}\n${indexOfLines(count - links.length, width)}`,
    );
  }

  test("past Claude Code's 200 lines", () => {
    bigIndex(201);
    expect(lint().findings).toEqual([
      {
        id: 'index-over-cap',
        folder: 'proj',
        file: at('proj/MEMORY.md'),
        message: "201 of 200 lines (Claude Code's load limit)",
      },
    ]);
  });

  test('at 200 lines, nothing', () => {
    bigIndex(200);
    expect(lint().findings).toEqual([]);
  });

  test("past Claude Code's 25 KB", () => {
    bigIndex(100, 290);
    const { findings } = lint();
    expect(ids(findings)).toEqual(['index-over-cap']);
    expect(findings[0]?.message).toMatch(
      /^\d{2},\d{3} of 25,600 bytes \(Claude Code's load limit\)$/,
    );
  });

  test('past indexLineCap from the settings', () => {
    write('settings.json', '{ "indexLineCap": 4 }');
    expect(lint().findings).toEqual([
      {
        id: 'index-over-cap',
        folder: 'proj',
        file: at('proj/MEMORY.md'),
        message: '5 of 4 lines (indexLineCap)',
      },
    ]);
  });

  test('past both the cap and the load limit, one finding names both', () => {
    write('settings.json', '{ "indexLineCap": 80 }');
    bigIndex(201);
    const { findings } = lint();
    expect(findings.map((finding) => finding.message)).toEqual([
      "201 of 80 lines (indexLineCap); 201 of 200 lines (Claude Code's load limit)",
    ]);
  });
});

describe('index-line-long', () => {
  test('a line past 300 characters', () => {
    append('proj/MEMORY.md', `- ${'x'.repeat(300)}\n`);
    expect(lint().findings).toEqual([
      {
        id: 'index-line-long',
        folder: 'proj',
        file: at('proj/MEMORY.md'),
        line: 6,
        message: '302 of 300 characters',
      },
    ]);
  });

  test('a line of exactly 300 characters, nothing', () => {
    append('proj/MEMORY.md', `- ${'x'.repeat(298)}\n`);
    expect(lint().findings).toEqual([]);
  });

  test('a CRLF line is measured without its carriage return', () => {
    append('proj/MEMORY.md', `- ${'x'.repeat(298)}\r\n`);
    expect(lint().findings).toEqual([]);
  });

  test('indexLineLength from the settings', () => {
    write('settings.json', '{ "indexLineLength": 400 }');
    append('proj/MEMORY.md', `- ${'x'.repeat(348)}\n`);
    expect(lint().findings).toEqual([]);
  });

  test("a family folder's index is checked too", () => {
    append('fam/MEMORY.md', `- ${'x'.repeat(300)}\n`);
    const { findings } = lint();
    expect(findings.map((finding) => [finding.id, finding.folder])).toEqual([
      ['index-line-long', 'fam'],
    ]);
  });
});

describe('workstream-cut', () => {
  // Lines of 50 characters, so the cut lands on a line break as it does in real files.
  function lines(total: number): string {
    return Array.from({ length: Math.ceil(total / 50) }, () =>
      'y'.repeat(49),
    ).join('\n');
  }

  function sized(state: number, next: number): string {
    return `## State\n\n${lines(state)}\n\n## Next steps\n\n${lines(next)}\n`;
  }

  function sectionLength(file: string, heading: string): number {
    return readSection(file, heading)?.length ?? 0;
  }

  test('State past what Next steps leaves it', () => {
    const file = write(
      'proj/alpha.md',
      workstream('alpha', 'open', sized(5400, 20)),
    );
    const total =
      sectionLength(file, '## State') + sectionLength(file, '## Next steps');
    expect(lint().findings).toEqual([
      {
        id: 'workstream-cut',
        folder: 'proj',
        file,
        message: `State and Next steps: ${total.toLocaleString('en-US')} of 5,000`,
      },
    ]);
  });

  test('Next steps past its own budget', () => {
    const file = write(
      'proj/alpha.md',
      workstream('alpha', 'open', sized(20, 3200)),
    );
    const next = sectionLength(file, '## Next steps');
    const { findings } = lint();
    expect(findings.map((finding) => finding.message)).toEqual([
      `Next steps: ${next.toLocaleString('en-US')} of 3,000`,
    ]);
  });

  test('both cut, one clause each', () => {
    write('proj/alpha.md', workstream('alpha', 'open', sized(4000, 3500)));
    const { findings } = lint();
    expect(ids(findings)).toEqual(['workstream-cut']);
    expect(findings[0]?.message).toMatch(
      /^State and Next steps: \d,\d{3} of 5,000; Next steps: 3,\d{3} of 3,000$/,
    );
  });

  test('a section within its budget, nothing', () => {
    write('proj/alpha.md', workstream('alpha', 'open', sized(2000, 2000)));
    expect(lint().findings).toEqual([]);
  });

  test('a closed workstream is checked, since a record can still match it', () => {
    write('proj/beta.md', workstream('beta', 'closed', sized(5400, 20)));
    expect(ids(lint().findings)).toEqual(['workstream-cut']);
  });

  test("a family folder's workstream is checked", () => {
    write('fam/shared.md', workstream('shared', 'open', sized(5400, 20)));
    const { findings } = lint();
    expect(findings.map((finding) => [finding.id, finding.folder])).toEqual([
      ['workstream-cut', 'fam'],
    ]);
  });

  test('a store reached through a symlink measures against the real path', () => {
    const link = path.join(tmp, 'link');
    fs.symlinkSync(store, link);
    const file = write(
      'proj/alpha.md',
      workstream('alpha', 'open', sized(5400, 20)),
    );
    const { findings } = lintStore(link, deps());
    expect(findings.map((finding) => finding.file)).toEqual([file]);
  });
});

describe('workstream-dropped', () => {
  function linked(name: string, text: string): string {
    append('proj/MEMORY.md', `- [${name}](${name}.md)\n`);
    return write(`proj/${name}.md`, text);
  }

  test('a file with no front matter', () => {
    const file = linked('notes', '# Notes\n');
    expect(lint().findings).toEqual([
      {
        id: 'workstream-dropped',
        folder: 'proj',
        file,
        message:
          'its front matter does not parse: it needs a --- line at the top and another closing it',
      },
    ]);
  });

  test('front matter that never closes', () => {
    linked('open', '---\nname: open\n\nBody.\n');
    expect(ids(lint().findings)).toEqual(['workstream-dropped']);
  });

  test('a workstream without a name', () => {
    linked(
      'nameless',
      '---\ndescription: x\nmetadata:\n  kind: workstream\n  status: open\n---\n\n## State\n',
    );
    expect(lint().findings.map((finding) => finding.message)).toEqual([
      'the hook drops this workstream: it has no name',
    ]);
  });

  test('a workstream whose status is neither open nor closed', () => {
    linked('paused', workstream('paused', 'paused'));
    expect(lint().findings.map((finding) => finding.message)).toEqual([
      'the hook drops this workstream: its status is "paused", not open or closed',
    ]);
  });

  test('a workstream with neither, both named', () => {
    linked(
      'bare',
      '---\nname:\nmetadata:\n  kind: workstream\n---\n\n## State\n',
    );
    expect(lint().findings.map((finding) => finding.message)).toEqual([
      'the hook drops this workstream: it has no name, and it has no status',
    ]);
  });
});

describe('settings-invalid', () => {
  test('a schema failure is one store-wide finding', () => {
    write('settings.json', '{ "indexLineCap": 0 }');
    expect(lint().findings).toEqual([
      {
        id: 'settings-invalid',
        folder: '',
        file: at('settings.json'),
        message: 'indexLineCap must be a positive integer; defaults apply',
      },
    ]);
  });

  test('a file that is not JSON', () => {
    write('settings.json', 'not json');
    const { findings } = lint();
    expect(ids(findings)).toEqual(['settings-invalid']);
    expect(findings[0]?.message).toStartWith('not valid JSON: ');
  });

  test('the defaults apply when the file fails', () => {
    write('settings.json', '{ "indexLineLength": "long" }');
    append('proj/MEMORY.md', `- ${'x'.repeat(300)}\n`);
    expect(ids(lint().findings)).toEqual([
      'index-line-long',
      'settings-invalid',
    ]);
  });
});

describe('unreadable', () => {
  test('a file the lint cannot read is named, and the run goes on', () => {
    lock('proj/reference.md');
    append('proj/MEMORY.md', '- [gone](gone.md)\n');
    expect(lint().findings).toEqual([
      {
        id: 'dead-link',
        folder: 'proj',
        file: at('proj/MEMORY.md'),
        line: 6,
        message: 'links to gone.md, which does not exist',
      },
      {
        id: 'unreadable',
        folder: 'proj',
        file: at('proj/reference.md'),
        message: 'cannot be read (EACCES), so the lint skipped it',
      },
    ]);
  });

  test('an unreadable index does not leave its files unindexed', () => {
    lock('proj/MEMORY.md');
    expect(ids(lint().findings)).toEqual(['unreadable']);
  });

  test('an unreadable file on the way does not leave what it links unindexed', () => {
    lock('proj/archive.md');
    expect(ids(lint().findings)).toEqual(['unreadable']);
  });

  test('an unreadable file nothing links is unindexed too', () => {
    write('proj/orphan.md', reference('orphan'));
    lock('proj/orphan.md');
    expect(ids(lint().findings)).toEqual(['unindexed', 'unreadable']);
  });
});

describe('folders and counts', () => {
  function defects(): void {
    write('settings.json', '{ "indexLineCap": 0 }');
    append('proj/MEMORY.md', '- [gone](gone.md)\n- [lost](lost.md)\n');
    write('proj/orphan.md', reference('orphan'));
    write('fam/orphan.md', reference('orphan'));
    write('fam/repo/orphan.md', reference('orphan'));
  }

  test('counts are per id, over every folder', () => {
    defects();
    expect(lint().counts).toEqual({
      'dead-link': 2,
      unindexed: 3,
      'settings-invalid': 1,
    });
  });

  test('folders narrow to those folders plus store-wide findings', () => {
    defects();
    const { findings, counts } = lint(['fam/repo']);
    expect(findings.map((finding) => [finding.id, finding.folder])).toEqual([
      ['unindexed', 'fam/repo'],
      ['settings-invalid', ''],
    ]);
    expect(counts).toEqual({ unindexed: 1, 'settings-invalid': 1 });
  });

  test('folders take several names', () => {
    defects();
    const folders = lint(['proj', 'fam']).findings.map(
      (finding) => finding.folder,
    );
    expect(folders).toEqual(['proj', 'proj', 'fam', 'proj', '']);
  });
});
