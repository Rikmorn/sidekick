import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { removeTemps, tmp } from './fixtures/worker/repo.js';
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

describe('briefFileIssues', () => {
  const setup = () => {
    const top = tmp();
    fs.mkdirSync(path.join(top, 'docs'));
    fs.writeFileSync(path.join(top, 'docs/plan.md'), '');
    fs.writeFileSync(path.join(top, 'docs/spec.md'), '');
    const b: Brief = {
      ...valid,
      plan: path.join(top, 'docs/plan.md'),
      spec: path.join(top, 'docs/spec.md'),
      rulings: path.join(top, 'docs/rulings.md'),
    };
    return { top, b };
  };
  test('no issues when files exist and rulings need only its folder', () => {
    const { top, b } = setup();
    expect(briefFileIssues(b, top)).toEqual([]);
  });
  test("holds when the brief's paths reach top through a symlink", () => {
    const { top, b } = setup();
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(top, link);
    const through = (file: string): string =>
      path.join(link, path.relative(top, file));
    const linked: Brief = {
      ...b,
      plan: through(b.plan),
      spec: through(b.spec),
      rulings: through(b.rulings),
    };
    expect(briefFileIssues(linked, top)).toEqual([]);
  });
  test('names a missing plan and a missing spec', () => {
    const { top, b } = setup();
    fs.rmSync(b.plan);
    fs.rmSync(b.spec);
    const issues = briefFileIssues(b, top);
    expect(issues.length).toBe(2);
    expect(issues[0]).toContain('plan');
    expect(issues[1]).toContain('spec');
  });
  test('names a missing rulings folder', () => {
    const { top, b } = setup();
    const issues = briefFileIssues(
      { ...b, rulings: path.join(top, 'nope/r.md') },
      top,
    );
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain('rulings');
  });
  test('names each path outside top', () => {
    const { top, b } = setup();
    const other = tmp();
    write(other, 'p.md', '');
    const issues = briefFileIssues(
      {
        ...b,
        plan: path.join(other, 'p.md'),
        rulings: path.join(other, 'r.md'),
      },
      top,
    );
    expect(issues.length).toBe(2);
    expect(issues.join('\n')).toContain('plan');
    expect(issues.join('\n')).toContain('rulings');
  });
  test('a top-level entry whose name starts with ".." is inside top', () => {
    const { top, b } = setup();
    fs.mkdirSync(path.join(top, '..docs'));
    const plan = path.join(top, '..docs', 'plan.md');
    fs.writeFileSync(plan, '');
    expect(briefFileIssues({ ...b, plan }, top)).toEqual([]);
  });
  test('a ".." segment cannot escape top', () => {
    const { top, b } = setup();
    const issues = briefFileIssues(
      { ...b, plan: `${top}/docs/../../x.md` },
      top,
    );
    expect(issues.join('\n')).toContain('plan');
  });
});
