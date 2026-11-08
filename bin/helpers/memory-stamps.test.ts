import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, tmp } from './fixtures/worker/repo.js';
import { copyState, ownedChanges } from './memory-link-facts.js';
import { sameIgnoringStamps, withoutStamps } from './memory-stamps.js';
import { execRunner } from './pm-data.js';

afterEach(removeTemps);

const file = (stamps: string, body = 'Body.\n', extra = ''): string =>
  `---\nname: x\n${extra}${stamps}---\n${body}`;
const A = 'node_type: memory\noriginSessionId: s1\nmodified: 2026-11-01\n';
const B = 'node_type: other\noriginSessionId: s2\nmodified: 2026-11-02\n';

describe('sameIgnoringStamps', () => {
  test('texts that differ only in the three stamp keys are the same', () => {
    expect(sameIgnoringStamps(file(A), file(B))).toBe(true);
    expect(sameIgnoringStamps(file(A), file(''))).toBe(true);
  });

  test('a body line that begins `modified:` or `node_type:` is a difference', () => {
    expect(
      sameIgnoringStamps(file(A, 'modified: 1\n'), file(A, 'modified: 2\n')),
    ).toBe(false);
    expect(
      sameIgnoringStamps(file(A, 'node_type: a\n'), file(A, 'node_type: b\n')),
    ).toBe(false);
  });

  test('a difference in another front-matter key is a difference', () => {
    expect(
      sameIgnoringStamps(
        file(A, 'Body.\n', 'a: 1\n'),
        file(A, 'Body.\n', 'a: 2\n'),
      ),
    ).toBe(false);
  });

  test('a file with no front matter compares byte for byte', () => {
    expect(sameIgnoringStamps('modified: 1\n', 'modified: 2\n')).toBe(false);
    expect(sameIgnoringStamps('same\n', 'same\n')).toBe(true);
    expect(withoutStamps('modified: 1\n')).toBe('modified: 1\n');
  });
});

describe('copyState', () => {
  test('reads a stamp-only difference as the same file, and a body difference as differing', () => {
    const base = tmp();
    fs.writeFileSync(path.join(base, 'a.md'), file(A));
    fs.writeFileSync(path.join(base, 'b.md'), file(B));
    fs.writeFileSync(path.join(base, 'c.md'), file(B, 'Other.\n'));
    expect(copyState(path.join(base, 'a.md'), path.join(base, 'b.md'))).toBe(
      'same',
    );
    expect(copyState(path.join(base, 'a.md'), path.join(base, 'c.md'))).toBe(
      'differs',
    );
  });
});

describe('ownedChanges', () => {
  function world(copy: string, original: string): string[] {
    const base = tmp();
    const store = path.join(base, 'store');
    const def = path.join(base, 'memory');
    fs.mkdirSync(path.join(store, 'odin'), { recursive: true });
    fs.mkdirSync(def);
    git(store, 'init', '-q');
    fs.writeFileSync(path.join(store, 'odin', 'n.md'), copy);
    fs.writeFileSync(path.join(def, 'n.md'), original);
    const out = ownedChanges(
      store,
      { folderRel: 'odin', projectKey: 'odin', defaultFolder: def },
      execRunner,
    );
    if ('issue' in out) throw new Error(out.issue);
    return out.paths;
  }

  test('a stamp-only change is owned, as an unchanged copy is', () => {
    expect(world(file(A), file(B))).toEqual(['odin/n.md']);
    expect(world(file(A), file(A))).toEqual(['odin/n.md']);
  });

  test('a body change is not owned', () => {
    expect(world(file(A), file(A, 'Changed.\n'))).toEqual([]);
  });
});
