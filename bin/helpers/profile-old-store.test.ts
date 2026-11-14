import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { jobsFromStore, oldStoreIssues } from './profile-old-store.js';

const made: string[] = [];
const tmp = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-old-store-'));
  made.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of made.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const profile = (store: string, name: string): void => {
  fs.mkdirSync(path.join(store, name), { recursive: true });
  fs.writeFileSync(
    path.join(store, name, 'profile.json'),
    '{"description":"d"}',
  );
};

const job = (config: string, id: string, body: string): void => {
  fs.mkdirSync(path.join(config, 'jobs', id), { recursive: true });
  fs.writeFileSync(path.join(config, 'jobs', id, 'state.json'), body);
};

// What a POSIX shell makes of `line` once each command word is swapped for printf.
const wordsOf = (line: string): string[] => {
  const probe = line
    .replace(/^mkdir -p /, "printf '%s\\n' ")
    .replace(/(^| && )mv /, "$1printf '%s\\n' ");
  const shell = spawnSync('sh', ['-c', probe], { encoding: 'utf-8' });
  return shell.stdout.split('\n').filter((l) => l !== '');
};

describe('oldStoreIssues', () => {
  test('names the held profiles and moves the whole folder when the new store is absent', () => {
    const home = tmp();
    const old = path.join(home, '.claude', 'profiles');
    profile(old, 'worker');
    const lines = oldStoreIssues({}, home, home);
    const fresh = path.join(home, '.claude', 'sidekick', 'profiles');
    expect(lines[0]).toContain('worker');
    expect(lines[0]).toContain(old);
    expect(lines[0]).toContain(fresh);
    expect(lines[1]).toBe(
      `mkdir -p '${path.dirname(fresh)}' && mv '${old}' '${fresh}'`,
    );
    expect(lines).toHaveLength(2);
  });

  test('moves one profile at a time into a present store and flags a clash', () => {
    const home = tmp();
    const old = path.join(home, '.claude', 'profiles');
    const fresh = path.join(home, '.claude', 'sidekick', 'profiles');
    profile(old, 'a');
    profile(old, 'b');
    profile(fresh, 'b');
    const lines = oldStoreIssues({}, home, home);
    expect(lines[1]).toBe(`mv '${old}/a' '${fresh}/a'`);
    expect(lines[2]).toContain('merge');
    expect(lines[2]).toContain(`${old}/b`);
    expect(lines[2]).not.toContain('mv ');
  });

  test('gives nothing for a store holding only dotfiles or plain files', () => {
    const home = tmp();
    const old = path.join(home, '.claude', 'profiles');
    fs.mkdirSync(path.join(old, '.git'), { recursive: true });
    fs.writeFileSync(path.join(old, 'notes.txt'), 'x');
    expect(oldStoreIssues({}, home, home)).toEqual([]);
  });

  test('gives nothing when the old path links to the new store', () => {
    const home = tmp();
    const fresh = path.join(home, '.claude', 'sidekick', 'profiles');
    profile(fresh, 'worker');
    fs.symlinkSync(fresh, path.join(home, '.claude', 'profiles'));
    expect(oldStoreIssues({}, home, home)).toEqual([]);
  });

  test('gives nothing when SIDEKICK_PROFILES_DIR is set', () => {
    const home = tmp();
    profile(path.join(home, '.claude', 'profiles'), 'worker');
    expect(oldStoreIssues({ SIDEKICK_PROFILES_DIR: '/x' }, home, home)).toEqual(
      [],
    );
  });

  test('gives nothing when the old store is missing', () => {
    const home = tmp();
    expect(oldStoreIssues({}, home, home)).toEqual([]);
  });

  test('prints mv lines a POSIX shell reads back as the same two paths', () => {
    const home = path.join(tmp(), "my home's dir");
    const old = path.join(home, '.claude', 'profiles');
    const fresh = path.join(home, '.claude', 'sidekick', 'profiles');
    profile(old, 'a');
    profile(fresh, 'b');
    const line = oldStoreIssues({}, home, home)[1];
    expect(wordsOf(line)).toEqual([path.join(old, 'a'), path.join(fresh, 'a')]);
  });

  test('quotes the mkdir line and the whole-folder mv too', () => {
    const home = path.join(tmp(), "it's here");
    const old = path.join(home, '.claude', 'profiles');
    const fresh = path.join(home, '.claude', 'sidekick', 'profiles');
    profile(old, 'a');
    const line = oldStoreIssues({}, home, home)[1];
    expect(wordsOf(line)).toEqual([path.dirname(fresh), old, fresh]);
  });

  test('names a job whose respawn flags point at the old store, and skips bad records', () => {
    const home = tmp();
    const config = path.join(home, '.claude');
    const old = path.join(config, 'profiles');
    profile(old, 'worker');
    job(
      config,
      'j1',
      JSON.stringify({
        name: 'w1',
        respawnFlags: ['--add-dir', `${old}/worker`],
      }),
    );
    job(config, 'j2', '{not json');
    job(config, 'j3', JSON.stringify({ name: 'x' }));
    job(
      config,
      'j4',
      JSON.stringify({ respawnFlags: ['--add-dir', `${old}-x/worker`] }),
    );
    const lines = oldStoreIssues({}, home, home);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toStartWith('mkdir -p');
    expect(lines[2]).toContain('j1');
    expect(lines[2]).toContain('w1');
    expect(jobsFromStore(config, old)).toEqual([{ id: 'j1', name: 'w1' }]);
  });

  test('a work tree topped at HOME, as a dotfiles repo is, refuses the same way', () => {
    const home = tmp();
    profile(path.join(home, '.claude', 'profiles'), 'worker');
    expect(oldStoreIssues({}, home, home)[0]).toContain('worker');
  });
});

describe('jobsFromStore', () => {
  test('returns nothing when there is no jobs folder', () => {
    expect(jobsFromStore(tmp(), '/old')).toEqual([]);
  });
});
