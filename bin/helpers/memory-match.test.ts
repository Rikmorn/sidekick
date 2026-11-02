import { describe, expect, test } from 'bun:test';
import { type MatchFacts, matchWorkstream } from './memory-match.js';
import type { Workstream } from './memory-view.js';

function ws(
  name: string,
  status: 'open' | 'closed' = 'open',
  branches: Array<{ repo: string; branch: string }> = [],
): Workstream {
  return { name, description: '', status, branches, path: `/s/${name}.md` };
}

const NO_FACTS: MatchFacts = {
  ownRecordWorkstream: undefined,
  briefWorkstream: undefined,
  title: undefined,
  repoName: 'r',
  branch: undefined,
  defaultBranch: undefined,
};

function facts(over: Partial<MatchFacts>): MatchFacts {
  return { ...NO_FACTS, ...over };
}

function matchedName(
  result: ReturnType<typeof matchWorkstream>,
): string | undefined {
  return result.kind === 'matched' ? result.workstream.name : undefined;
}

function labelOf(
  result: ReturnType<typeof matchWorkstream>,
): string | undefined {
  return result.kind === 'matched' ? result.label : undefined;
}

describe('matchWorkstream', () => {
  const a = ws('alpha', 'open', [{ repo: 'r', branch: 'feat-a' }]);
  const b = ws('beta', 'open', [{ repo: 'r', branch: 'feat-b' }]);
  const closed = ws('old', 'closed', [{ repo: 'r', branch: 'feat-old' }]);

  test('tier 0 wins when the record names a workstream, closed included', () => {
    const result = matchWorkstream(
      [a, b, closed],
      facts({ ownRecordWorkstream: 'old', briefWorkstream: 'beta' }),
    );
    expect(result).toEqual({
      kind: 'matched',
      workstream: closed,
      label: "this session's record",
      others: [a, b],
    });
  });

  test('tier 1 wins below tier 0 and accepts a closed workstream', () => {
    const result = matchWorkstream(
      [a, b, closed],
      facts({ briefWorkstream: 'old', title: 'alpha' }),
    );
    expect(matchedName(result)).toBe('old');
    expect(labelOf(result)).toBe("the worker's brief");
  });

  test('an unknown tier-0 name falls through', () => {
    const result = matchWorkstream(
      [a, b],
      facts({ ownRecordWorkstream: 'ghost', briefWorkstream: 'beta' }),
    );
    expect(labelOf(result)).toBe("the worker's brief");
  });

  test('tier 0 takes the first of two workstreams sharing a name', () => {
    const first = ws('dup');
    const second = ws('dup');
    const result = matchWorkstream(
      [first, second],
      facts({ ownRecordWorkstream: 'dup' }),
    );
    expect(result.kind === 'matched' && result.workstream).toBe(first);
  });

  test('tier 2 matches the title equal, with colon, with space, in any case', () => {
    for (const title of ['alpha', 'alpha: more', 'alpha more', 'ALPHA']) {
      const result = matchWorkstream([a, b], facts({ title }));
      expect(matchedName(result)).toBe('alpha');
      expect(labelOf(result)).toBe('the title');
    }
  });

  test('tier 2 rejects a substring or a longer word', () => {
    expect(matchWorkstream([a], facts({ title: 'alphabet' })).kind).toBe(
      'menu',
    );
    expect(matchWorkstream([a], facts({ title: 'the alpha' })).kind).toBe(
      'menu',
    );
    expect(matchWorkstream([a], facts({ title: 'alpha-two' })).kind).toBe(
      'menu',
    );
  });

  test('a tier-2 tie yields no match at the tier and falls to tier 3', () => {
    const x = ws('x');
    const xy = ws('x y', 'open', [{ repo: 'r', branch: 'feat' }]);
    const result = matchWorkstream(
      [x, xy],
      facts({ title: 'x y z', branch: 'feat' }),
    );
    expect(matchedName(result)).toBe('x y');
    expect(labelOf(result)).toBe('branch feat');
  });

  test('tier 2 ignores a closed workstream', () => {
    expect(matchWorkstream([closed], facts({ title: 'old' })).kind).toBe(
      'menu',
    );
  });

  test('tier 2 beats tier 3', () => {
    const result = matchWorkstream(
      [a, b],
      facts({ title: 'beta', branch: 'feat-a' }),
    );
    expect(matchedName(result)).toBe('beta');
  });

  test('tier 3 matches the repo and branch pair', () => {
    const result = matchWorkstream([a, b], facts({ branch: 'feat-b' }));
    expect(result).toEqual({
      kind: 'matched',
      workstream: b,
      label: 'branch feat-b',
      others: [a],
    });
  });

  test('tier 3 requires the repo to match', () => {
    expect(
      matchWorkstream([a], facts({ branch: 'feat-a', repoName: 'other' })).kind,
    ).toBe('menu');
  });

  test('tier 3 with two workstreams on one branch yields the menu', () => {
    const twin = ws('twin', 'open', [{ repo: 'r', branch: 'feat-a' }]);
    expect(matchWorkstream([a, twin], facts({ branch: 'feat-a' })).kind).toBe(
      'menu',
    );
  });

  test('tier 3 ignores closed workstreams', () => {
    expect(matchWorkstream([closed], facts({ branch: 'feat-old' })).kind).toBe(
      'menu',
    );
  });

  test('the default branch never matches', () => {
    const onMain = ws('main-ws', 'open', [{ repo: 'r', branch: 'main' }]);
    expect(
      matchWorkstream(
        [onMain],
        facts({ branch: 'main', defaultBranch: 'main' }),
      ).kind,
    ).toBe('menu');
  });

  test('an unknown default branch excludes nothing', () => {
    const onMain = ws('main-ws', 'open', [{ repo: 'r', branch: 'main' }]);
    expect(
      matchedName(matchWorkstream([onMain], facts({ branch: 'main' }))),
    ).toBe('main-ws');
  });

  test('a detached HEAD skips tier 3', () => {
    expect(matchWorkstream([a], facts({ branch: undefined })).kind).toBe(
      'menu',
    );
  });

  test('the menu lists open workstreams only, by name', () => {
    expect(matchWorkstream([b, closed, a], NO_FACTS)).toEqual({
      kind: 'menu',
      open: [a, b],
    });
  });

  test('others are sorted by name', () => {
    const result = matchWorkstream(
      [b, a, closed],
      facts({ ownRecordWorkstream: 'old' }),
    );
    expect(result.kind === 'matched' && result.others).toEqual([a, b]);
  });
});
