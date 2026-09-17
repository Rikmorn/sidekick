import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveWorkDir, WorkDirError } from './work-dir.js';

function repoWith(dirs: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-workdir-'));
  for (const d of dirs) {
    fs.mkdirSync(path.join(root, '.sidekick', 'work', d), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.sidekick', 'work', d, 'RFC.md'),
      '# x\n',
    );
  }
  return root;
}

describe('resolveWorkDir', () => {
  it('resolves an issue number to its directory and RFC path', () => {
    const root = repoWith(['42-retry-policy']);
    const r = resolveWorkDir(root, 42);
    expect(r.dir).toBe(path.join(root, '.sidekick', 'work', '42-retry-policy'));
    expect(r.rfcPath).toBe(path.join(r.dir, 'RFC.md'));
  });

  it('does not match an issue number that is only a prefix of another', () => {
    const root = repoWith(['4-other', '42-retry-policy']);
    expect(resolveWorkDir(root, 4).dir.endsWith('4-other')).toBe(true);
    expect(resolveWorkDir(root, 42).dir.endsWith('42-retry-policy')).toBe(true);
  });

  it('throws not_found when no directory matches', () => {
    const root = repoWith(['42-retry-policy']);
    try {
      resolveWorkDir(root, 99);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(WorkDirError);
      expect((e as WorkDirError).kind).toBe('not_found');
    }
  });

  it('throws ambiguous when two directories share an issue number', () => {
    const root = repoWith(['42-retry-policy', '42-duplicate']);
    try {
      resolveWorkDir(root, 42);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as WorkDirError).kind).toBe('ambiguous');
    }
  });
});
