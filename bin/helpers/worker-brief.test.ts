import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import {
  type Brief,
  briefFileIssues,
  parseFrontmatter,
  readBrief,
} from './worker-brief.js';

afterEach(removeTemps);

const brief = (fields: string) =>
  `---\n${fields}\n---\n\n## Gates at the baseline\n`;

const valid = {
  name: 'plan-5',
  plan: '/repo/docs/plan.md',
  spec: '/repo/docs/spec.md',
  rulings: '/repo/docs/rulings.md',
  baseline: 'abcdef1',
  skill: 'subagent-driven-development',
  place: 'worktree',
  report: 'docs/report.md',
  orchestrator: 'seat',
};
const lines = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, val]) => `${k}: ${val}`)
    .join('\n');

const write = (dir: string, name: string, text: string) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
};
const readIssues = (fields: Record<string, string>): string[] => {
  const dir = tmp();
  const r = readBrief(write(dir, 'b.md', brief(lines(fields))));
  return 'issues' in r ? r.issues : [];
};

describe('parseFrontmatter', () => {
  test('a setup value keeps everything after the first ": "', () => {
    const r = parseFrontmatter(brief('setup: bun install && echo ok: done'));
    expect(r).toEqual({ fields: { setup: 'bun install && echo ok: done' } });
  });
  test('refuses a brief with no opening ---', () => {
    expect(parseFrontmatter('name: x\n---\n')).toHaveProperty('issues');
  });
  test('refuses a brief with no closing ---', () => {
    expect(parseFrontmatter('---\nname: x\n')).toHaveProperty('issues');
  });
  test('refuses a line that is not key: value', () => {
    expect(parseFrontmatter(brief('name x'))).toHaveProperty('issues');
    expect(parseFrontmatter(brief('Name: x'))).toHaveProperty('issues');
  });
  test('refuses a repeated key', () => {
    expect(parseFrontmatter(brief('name: a\nname: b'))).toHaveProperty(
      'issues',
    );
  });
  test('ignores blank lines', () => {
    expect(parseFrontmatter(brief('name: a\n\nskill: b'))).toEqual({
      fields: { name: 'a', skill: 'b' },
    });
  });
  test('CRLF endings and trailing spaces parse as the same brief', () => {
    const text = brief(lines(valid))
      .replace(/\n/g, '\r\n')
      .replace(/(: .*)\r/g, '$1  \r');
    expect(parseFrontmatter(text)).toEqual(
      parseFrontmatter(brief(lines(valid))),
    );
  });
});

describe('readBrief', () => {
  test('reads a valid brief, with and without setup', () => {
    const dir = tmp();
    const a = readBrief(write(dir, 'a.md', brief(lines(valid))));
    expect(a).toEqual({ brief: valid, path: path.join(dir, 'a.md') });
    const b = readBrief(
      write(dir, 'b.md', brief(lines({ ...valid, setup: 'bun install' }))),
    );
    expect('brief' in b && b.brief.setup).toBe('bun install');
  });
  test('resolves a relative file to an absolute path', () => {
    const dir = tmp();
    write(dir, 'a.md', brief(lines(valid)));
    const r = readBrief(path.relative(process.cwd(), path.join(dir, 'a.md')));
    expect('path' in r && r.path).toBe(path.join(dir, 'a.md'));
  });
  test('a missing file is an issue', () => {
    expect(readBrief(path.join(tmp(), 'none.md'))).toHaveProperty('issues');
  });
  test('an unknown key is an issue naming the key and the file', () => {
    const issues = readIssues({ ...valid, extra: 'x' });
    expect(issues.join('\n')).toContain('extra');
    expect(issues.join('\n')).toContain('b.md');
  });
  test('a missing field is an issue naming it', () => {
    const { report: _r, ...rest } = valid;
    expect(readIssues(rest).join('\n')).toContain('report');
  });
  const bad: [string, Record<string, string>][] = [
    ['name', { name: 'Bad Name' }],
    ['name', { name: 'a'.repeat(41) }],
    ['plan', { plan: 'docs/plan.md' }],
    ['baseline', { baseline: 'abcdef' }],
    ['skill', { skill: 'other' }],
    ['place', { place: 'branch' }],
    ['place', { place: 'branch a b' }],
    ['setup', { setup: '' }],
    ['report', { report: '/abs/report.md' }],
    ['report', { report: 'docs/../report.md' }],
    ['orchestrator', { orchestrator: '' }],
  ];
  for (const [field, change] of bad) {
    test(`refuses an invalid ${field}: ${JSON.stringify(change)}`, () => {
      const issues = readIssues({ ...valid, ...change });
      expect(issues.length).toBe(1);
      expect(issues[0]).toContain(field);
    });
  }
  test('accepts a name of 40 characters', () => {
    expect(readIssues({ ...valid, name: 'a'.repeat(40) })).toEqual([]);
  });
  test('accepts place "branch <name>" and "in-place"', () => {
    expect(readIssues({ ...valid, place: 'branch x/y' })).toEqual([]);
    expect(readIssues({ ...valid, place: 'in-place' })).toEqual([]);
  });
});

describe('the target and workstream keys', () => {
  test('a brief with neither key still parses', () => {
    expect(readIssues(valid)).toEqual([]);
  });
  test('accepts a target and a workstream', () => {
    expect(
      readIssues({ ...valid, target: 'milestone/x', workstream: 'p4-verbs' }),
    ).toEqual([]);
  });
  test('refuses a target with a space', () => {
    expect(readIssues({ ...valid, target: 'a b' })).toHaveLength(1);
  });
  test('refuses a workstream with a capital or a leading hyphen', () => {
    expect(readIssues({ ...valid, workstream: 'Plan' })).toHaveLength(1);
    expect(readIssues({ ...valid, workstream: '-plan' })).toHaveLength(1);
  });
});

describe('briefFileIssues', () => {
  const fileIn = (dir: string, name: string): string => {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    return write(dir, name, '');
  };
  const sibling = (main: string, name: string): string => {
    const dir = path.join(tmp(), name);
    git(main, 'worktree', 'add', '-q', '-b', name, dir);
    return fs.realpathSync(dir);
  };
  const setup = () => {
    const main = repo();
    const b: Brief = {
      ...valid,
      plan: fileIn(main, 'docs/plan.md'),
      spec: fileIn(main, 'docs/spec.md'),
      rulings: path.join(main, 'docs/rulings.md'),
    };
    return { main, b, briefPath: path.join(main, 'docs/brief.md') };
  };
  const issuesFor = (
    b: Brief,
    briefPath: string,
    launchTop: string,
    mainTop: string,
  ) =>
    briefFileIssues(b, { briefPath, launchTop, mainTop, runGit: execRunner });

  test('no issues when files exist and rulings need only its folder', () => {
    const { main, b, briefPath } = setup();
    expect(issuesFor(b, briefPath, main, main)).toEqual([]);
  });
  test("holds when the brief's paths reach the checkout through a symlink", () => {
    const { main, b, briefPath } = setup();
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(main, link);
    const through = (file: string): string =>
      path.join(link, path.relative(main, file));
    const linked: Brief = {
      ...b,
      plan: through(b.plan),
      spec: through(b.spec),
      rulings: through(b.rulings),
    };
    expect(issuesFor(linked, through(briefPath), link, link)).toEqual([]);
  });
  test('names a missing plan and a missing spec', () => {
    const { main, b, briefPath } = setup();
    fs.rmSync(b.plan);
    fs.rmSync(b.spec);
    expect(issuesFor(b, briefPath, main, main)).toEqual([
      `plan: ${b.plan} does not exist`,
      `spec: ${b.spec} does not exist`,
    ]);
  });
  test('a missing rulings folder gets one line, with no checkout check', () => {
    const { main, b, briefPath } = setup();
    const rulings = path.join(main, 'nope/r.md');
    expect(issuesFor({ ...b, rulings }, briefPath, main, main)).toEqual([
      `rulings: the folder ${path.dirname(rulings)} does not exist`,
    ]);
  });
  test('a plan in a sibling worktree, launched from the main checkout, refuses', () => {
    const { main, b, briefPath } = setup();
    const sib = sibling(main, 'sib');
    const plan = fileIn(sib, 'docs/plan.md');
    expect(issuesFor({ ...b, plan }, briefPath, main, main)).toEqual([
      `plan: ${plan} is in the checkout ${sib}; it must be in the launching checkout ${main}`,
    ]);
  });
  test('from a sibling worktree, a plan in the main checkout passes and its rulings refuse', () => {
    const { main, b } = setup();
    const sib = sibling(main, 'sib');
    const briefPath = fileIn(sib, 'docs/brief.md');
    expect(issuesFor(b, briefPath, sib, main)).toEqual([
      `rulings: ${b.rulings} is in the checkout ${main}; it must be in the launching checkout ${sib}`,
    ]);
  });
  test('a plan in a third checkout names both allowed checkouts', () => {
    const { main, b } = setup();
    const sib = sibling(main, 'sib');
    const other = sibling(main, 'other');
    const briefPath = fileIn(sib, 'docs/brief.md');
    const plan = fileIn(other, 'docs/plan.md');
    const rulings = path.join(sib, 'docs/r.md');
    expect(issuesFor({ ...b, plan, rulings }, briefPath, sib, main)).toEqual([
      `plan: ${plan} is in the checkout ${other}; it must be in the launching checkout ${sib} or the main checkout ${main}`,
    ]);
  });
  test('from the main checkout, a brief inside a nested worktree refuses', () => {
    const { main, b } = setup();
    const nested = path.join(main, '.claude/worktrees/x');
    git(main, 'worktree', 'add', '-q', '-b', 'x', nested);
    const briefPath = fileIn(nested, 'docs/brief.md');
    expect(issuesFor(b, briefPath, main, main)).toEqual([
      `brief: ${briefPath} is in the checkout ${nested}; it must be in the launching checkout ${main}`,
    ]);
  });
  test('a path in no git checkout says so', () => {
    const { main, b, briefPath } = setup();
    const plan = fileIn(tmp(), 'p.md');
    expect(issuesFor({ ...b, plan }, briefPath, main, main)).toEqual([
      `plan: ${plan} is in no git checkout; it must be in the launching checkout ${main}`,
    ]);
  });
  test('a top-level entry whose name starts with ".." is inside the checkout', () => {
    const { main, b, briefPath } = setup();
    const plan = fileIn(main, '..docs/plan.md');
    expect(issuesFor({ ...b, plan }, briefPath, main, main)).toEqual([]);
  });
  test('a ".." segment cannot escape the checkout', () => {
    const { main, b, briefPath } = setup();
    const outside = fileIn(tmp(), 'x.md');
    const plan = path.join(main, 'docs', '..', path.relative(main, outside));
    const issues = issuesFor({ ...b, plan }, briefPath, main, main);
    expect(issues.join('\n')).toContain('plan');
  });
});
