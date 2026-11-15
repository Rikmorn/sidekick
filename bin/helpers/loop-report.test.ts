import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LOOP,
  REPORT_TEXT,
  snapshot,
  UNIT,
  type UnitFixture,
  unitFixture,
  WORKER,
} from './fixtures/loop/units.js';
import { git, removeTemps, tmp } from './fixtures/worker/repo.js';
import { LOOP_USAGE_LINE, type LoopEnv, runLoopCli } from './loop.js';
import { loopReport, REPORT_USAGE_LINE } from './loop-report.js';
import { keyHits } from './memory-patterns.js';

afterEach(removeTemps);

const key = (): string => `${'ghp'}${'_'}${'a1'.repeat(18)}`;
const dashes = '-'.repeat(5);
const keyBlock = (): string[] => [
  `${dashes}BEGIN RSA PRIVATE ${'KEY'}${dashes}`,
  'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
  'KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQJAIJLixBy2qpFoS4DSmoEm',
  `${dashes}END RSA PRIVATE ${'KEY'}${dashes}`,
];

const reportArgs = (unit = UNIT): string[] => ['report', LOOP, '--unit', unit];

const GAP =
  'the report has no ## Proposals section, so it proposes no outward action: read that as a gap in the report, not as nothing to do';

function run(fx: UnitFixture, args: string[], over: Partial<LoopEnv> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runLoopCli(
    args,
    fx.lenv(over),
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
}

const inTree = (fx: UnitFixture): string =>
  path.join(fx.worktree, 'unit-report.md');
const inAttempt = (fx: UnitFixture): string =>
  path.join(fx.attempt, 'report.md');

const header = (file: string): string =>
  `report of unit ${UNIT} · worker ${WORKER}, from ${file}:`;

const reportLines = REPORT_TEXT.replace(/\n$/, '').split('\n');

const headLine = (fx: UnitFixture): string =>
  `head of worktree-${WORKER}: ${git(fx.worktree, 'rev-parse', 'HEAD')} work`;

const gone = `the worktree of ${WORKER} is gone, so report reads no branch head`;

describe('loop report prints', () => {
  test('report prints from the worktree, then from the attempt folder', () => {
    const fx = unitFixture();
    const head = headLine(fx);
    const r = run(fx, reportArgs());
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual([header(inTree(fx)), ...reportLines, head]);
    const discard = ['discard', LOOP, '--unit', UNIT, '--reason', 'done'];
    expect(run(fx, discard).code).toBe(0);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    const after = run(fx, reportArgs());
    expect(after.err).toEqual([]);
    expect(after.code).toBe(0);
    expect(after.out).toEqual([header(inAttempt(fx)), ...reportLines, gone]);
  });

  test("a worktree that holds no report falls back to the attempt folder's", () => {
    const fx = unitFixture({ report: false });
    fs.writeFileSync(inAttempt(fx), REPORT_TEXT);
    const r = run(fx, reportArgs());
    expect(r.code).toBe(0);
    expect(r.out).toEqual([
      header(inAttempt(fx)),
      ...reportLines,
      headLine(fx),
    ]);
  });

  test('report of an overdue attempt prints the reap, then the report its discard saved', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    const r = run(fx, reportArgs());
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out[0]).toStartWith(`unit ${UNIT} · worker ${WORKER} worked 240`);
    expect(r.out.slice(-(reportLines.length + 2))).toEqual([
      header(inAttempt(fx)),
      ...reportLines,
      gone,
    ]);
  });

  test('report withholds a key', () => {
    const fx = unitFixture({ report: false });
    const text = [
      '# Unit report',
      `The token is ${key()}.`,
      ...keyBlock(),
      'after',
      '## Proposals',
      'None.',
    ];
    fs.writeFileSync(inTree(fx), `${text.join('\n')}\n`);
    git(fx.worktree, 'commit', '-q', '--allow-empty', '-m', `use ${key()}`);
    const sha = git(fx.worktree, 'rev-parse', 'HEAD');
    const r = run(fx, reportArgs());
    expect(r.code).toBe(0);
    const block = '(withheld: private-key-block)';
    expect(r.out).toEqual([
      header(inTree(fx)),
      '# Unit report',
      '(withheld: github-classic-pat)',
      block,
      block,
      block,
      block,
      'after',
      '## Proposals',
      'None.',
      `head of worktree-${WORKER}: ${sha} (withheld: github-classic-pat)`,
    ]);
    const printed = r.out.join('\n');
    expect(printed).not.toContain(key());
    expect(printed).not.toContain('MIIBOg');
  });

  test('report escapes a control character in the report, keeping a tab', () => {
    const fx = unitFixture({ report: false });
    const text = [
      '# Unit report',
      '\u001b[2Jcleared \u001b[31mred\u001b[0m',
      'a\u0085b\u007fc\u0007d\re',
      'col\tcol',
      '## Proposals',
      'None.',
    ];
    fs.writeFileSync(inTree(fx), `${text.join('\n')}\n`);
    const r = run(fx, reportArgs());
    expect(r.code).toBe(0);
    expect(r.out).toEqual([
      header(inTree(fx)),
      '# Unit report',
      '\\x1b[2Jcleared \\x1b[31mred\\x1b[0m',
      'a\\x85b\\x7fc\\x07d\\x0de',
      'col\tcol',
      '## Proposals',
      'None.',
      headLine(fx),
    ]);
  });

  test('report escapes a control character in the commit subject', () => {
    const fx = unitFixture();
    git(
      fx.worktree,
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'fix \u001b[2J now',
    );
    const sha = git(fx.worktree, 'rev-parse', 'HEAD');
    const r = run(fx, reportArgs());
    expect(r.code).toBe(0);
    expect(r.out.at(-1)).toBe(
      `head of worktree-${WORKER}: ${sha} fix \\x1b[2J now`,
    );
    expect(r.out.join('\n')).not.toContain('\u001b');
  });

  test('report names a missing proposals section', () => {
    const fx = unitFixture({ report: false });
    fs.writeFileSync(inTree(fx), '# Unit report\n\nFixed the widget.\n');
    const r = run(fx, reportArgs());
    expect(r.code).toBe(0);
    expect(r.out).toEqual([
      header(inTree(fx)),
      '# Unit report',
      '',
      'Fixed the widget.',
      headLine(fx),
      GAP,
    ]);
  });

  test('report warns when the reap cannot stop an overdue worker, and still prints', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    fx.claude.state.stopResult = {
      code: 1,
      stdout: '',
      stderr: '',
      timedOut: false,
    };
    const before = snapshot(fx.loopDir);
    const r = run(fx, reportArgs());
    expect(r.code).toBe(0);
    expect(r.err[0]).toBe(
      'reap could not run, so an attempt past its work cap may run on:',
    );
    expect(r.err[1]).toStartWith(`unit ${UNIT} · worker ${WORKER} worked 240`);
    expect(r.out).toEqual([header(inTree(fx)), ...reportLines, headLine(fx)]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('a report at the byte cap prints, and one byte more refuses', () => {
    const fx = unitFixture({ report: false });
    const call = (cap: number) => {
      const out: string[] = [];
      const err: string[] = [];
      const code = loopReport(
        reportArgs().slice(1),
        fx.lenv(),
        (l) => out.push(l),
        (l) => err.push(l),
        { maxBytes: cap },
      );
      return { code, out, err };
    };
    fs.writeFileSync(inTree(fx), '## Proposals\n\n');
    expect(call(14).code).toBe(0);
    const r = call(13);
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [
        `${inTree(fx)} holds 14 bytes, past the cap of 13, so report prints none of it`,
      ],
    });
  });
});

describe('loop report refuses a report that is not a plain file inside its folder', () => {
  // `make` replaces the report at `file` with something that points at `outside`.
  const rows: [
    string,
    (fx: UnitFixture) => string,
    (file: string, outside: string) => void,
    (fx: UnitFixture) => string[],
  ][] = [
    [
      "the worktree's, as a symbolic link",
      inTree,
      (file, outside) => fs.symlinkSync(outside, file),
      (fx) => [
        `${inTree(fx)} is a symbolic link`,
        `${inTree(fx)} is outside the worktree ${fx.worktree} by real path`,
      ],
    ],
    [
      "the worktree's, as a hard link",
      inTree,
      (file, outside) => fs.linkSync(outside, file),
      (fx) => [
        `${inTree(fx)} has 2 links, so it may be a hard link to a file elsewhere`,
      ],
    ],
    [
      "the worktree's, as a folder",
      inTree,
      (file) => fs.mkdirSync(file),
      (fx) => [`${inTree(fx)} is not a regular file`],
    ],
    [
      "the attempt folder's, as a symbolic link",
      inAttempt,
      (file, outside) => fs.symlinkSync(outside, file),
      (fx) => [
        `${inAttempt(fx)} is a symbolic link`,
        `${inAttempt(fx)} is outside the attempt folder ${fx.attempt} by real path`,
      ],
    ],
    [
      "the attempt folder's, as a hard link",
      inAttempt,
      (file, outside) => fs.linkSync(outside, file),
      (fx) => [
        `${inAttempt(fx)} has 2 links, so it may be a hard link to a file elsewhere`,
      ],
    ],
  ];

  test.each(rows)('%s', (_label, place, make, reasons) => {
    const fx = unitFixture({ report: false });
    const outside = path.join(tmp(), 'secret.txt');
    fs.writeFileSync(outside, 'secret\n');
    make(place(fx), outside);
    const r = run(fx, reportArgs());
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual([
      ...reasons(fx),
      `a unit report must be a plain file inside its folder, so report prints nothing from ${place(fx)}`,
    ]);
  });
});

describe('loop report refuses', () => {
  test('no report anywhere refuses, naming both places', () => {
    const fx = unitFixture({ report: false });
    const r = run(fx, reportArgs());
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [
        `no report for worker ${WORKER}: none at ${inTree(fx)}, and none at ${inAttempt(fx)}`,
      ],
    });
  });

  test('a worktree gone with no report saved refuses, naming both places', () => {
    const fx = unitFixture({ report: false });
    const discard = ['discard', LOOP, '--unit', UNIT, '--reason', 'done'];
    expect(run(fx, discard).code).toBe(0);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    const r = run(fx, reportArgs());
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [
        `no report for worker ${WORKER}: none at ${inTree(fx)} (the worktree is gone), and none at ${inAttempt(fx)}`,
      ],
    });
  });

  test('a worktree whose link to the repo is broken prints the report, and runs no git there', () => {
    const fx = unitFixture();
    const elsewhere = tmp();
    fs.writeFileSync(path.join(fx.worktree, '.git'), `gitdir: ${elsewhere}\n`);
    const r = run(fx, reportArgs());
    expect(r.code).toBe(1);
    expect(r.out).toEqual([header(inTree(fx)), ...reportLines]);
    expect(r.err[0]).toBe(
      `the worktree ${fx.worktree} is not linked to its repo the way git links a worktree, so report runs no git there:`,
    );
    expect(r.err.join('\n')).toContain(elsewhere);
  });

  const rows: [
    string,
    string[],
    (fx: UnitFixture) => Partial<LoopEnv>,
    string,
  ][] = [
    [
      'a unit with no attempt in the record',
      reportArgs('triage-7'),
      () => ({}),
      'the record holds no attempt for unit triage-7, so report has nothing to print',
    ],
    [
      'a unit id that names a folder',
      reportArgs('..'),
      () => ({}),
      'unit: .. names a folder, not a unit',
    ],
    [
      "another loop's SIDEKICK_LOOP",
      reportArgs(),
      () => ({ env: { SIDEKICK_LOOP: 'other' } }),
      'SIDEKICK_LOOP is "other", so this session cannot run loop report for "fixer"',
    ],
  ];

  test.each(rows)('%s', (_label, args, setup, expected) => {
    const fx = unitFixture();
    const over = setup(fx);
    const r = run(fx, args, over);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err.join('\n')).toContain(expected);
  });

  test.each([
    ['no --unit', ['report', LOOP]],
    ['a text', [...reportArgs(), 'now']],
  ])('%s prints the usage', (_label, args) => {
    const fx = unitFixture();
    expect(run(fx, args)).toEqual({
      code: 1,
      out: [],
      err: [`usage: ${REPORT_USAGE_LINE}`],
    });
  });
});

test('the usage names report', () => {
  expect(REPORT_USAGE_LINE).toBe('sidekick loop report <name> --unit <id>');
  expect(LOOP_USAGE_LINE).toContain('| report <name> --unit <id>');
});

test('this test file holds no literal key', () => {
  expect(keyHits(fs.readFileSync(import.meta.path, 'utf8'))).toEqual([]);
});
