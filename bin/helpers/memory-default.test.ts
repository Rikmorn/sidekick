import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { removeTemps, tmp } from './fixtures/worker/repo.js';
import {
  claudeJsonPath,
  defaultMemoryFolder,
  knownRoot,
  overrideIssue,
  projectKey,
} from './memory-default.js';

afterEach(removeTemps);

const LONG = `/tmp/long/${'segment-'.repeat(30)}end`;

describe('projectKey', () => {
  test('replaces each character outside [a-zA-Z0-9] with a dash', () => {
    expect(projectKey('/Users/roberto.sousa/Documents/Projects/sidekick')).toBe(
      '-Users-roberto-sousa-Documents-Projects-sidekick',
    );
    expect(projectKey('/private/tmp/a b/c_d.e')).toBe('-private-tmp-a-b-c-d-e');
  });

  test('cuts a long path to 200 characters and appends the hash of the original', () => {
    const key = projectKey(LONG);
    expect(key).toHaveLength(207);
    expect(key.endsWith('egmen-tdqjxf')).toBe(true);
  });

  test('leaves a path of exactly 200 characters without a suffix', () => {
    expect(projectKey(`/${'a'.repeat(199)}`)).toHaveLength(200);
  });
});

describe('defaultMemoryFolder', () => {
  test('joins the config folder, projects, the key, and memory', () => {
    expect(defaultMemoryFolder('/r/my repo', '/cfg')).toBe(
      path.join('/cfg', 'projects', '-r-my-repo', 'memory'),
    );
  });
});

describe('overrideIssue', () => {
  test('accepts an environment with none of the variables', () => {
    expect(overrideIssue({})).toBeUndefined();
    expect(overrideIssue({ CLAUDE_CONFIG_DIR: '/c' })).toBeUndefined();
    expect(
      overrideIssue({ CLAUDE_CODE_PROJECT_DIR_NAME: 'x' }),
    ).toBeUndefined();
  });

  test('refuses the cowork override', () => {
    expect(
      overrideIssue({ CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: '/x' }),
    ).toContain('CLAUDE_COWORK_MEMORY_PATH_OVERRIDE');
  });

  test('refuses the remote memory folder', () => {
    expect(overrideIssue({ CLAUDE_CODE_REMOTE_MEMORY_DIR: '/x' })).toContain(
      'CLAUDE_CODE_REMOTE_MEMORY_DIR',
    );
  });

  test('refuses a project folder name together with a config folder', () => {
    const issue = overrideIssue({
      CLAUDE_CODE_PROJECT_DIR_NAME: 'x',
      CLAUDE_CONFIG_DIR: '/c',
    });
    expect(issue).toContain('CLAUDE_CODE_PROJECT_DIR_NAME');
    expect(issue).toContain('CLAUDE_CONFIG_DIR');
  });
});

describe('knownRoot', () => {
  const write = (body: string): string => {
    const file = path.join(tmp(), '.claude.json');
    fs.writeFileSync(file, body);
    return file;
  };

  test('is true for a root that is a key of projects', () => {
    const file = write(
      JSON.stringify({ projects: { '/r/a': {}, '/r/b': {} } }),
    );
    expect(knownRoot('/r/a', file)).toBe(true);
  });

  test('is false for an absent root', () => {
    const file = write(JSON.stringify({ projects: { '/r/a': {} } }));
    expect(knownRoot('/r/other', file)).toBe(false);
  });

  test('is false for a prototype property name', () => {
    const file = write(JSON.stringify({ projects: {} }));
    expect(knownRoot('toString', file)).toBe(false);
  });

  test('is false for a missing file', () => {
    expect(knownRoot('/r/a', path.join(tmp(), 'nope.json'))).toBe(false);
  });

  test('is false for malformed JSON or a projects value that is not a record', () => {
    expect(knownRoot('/r/a', write('{ not json'))).toBe(false);
    expect(knownRoot('/r/a', write('{"projects": [1]}'))).toBe(false);
    expect(knownRoot('/r/a', write('{}'))).toBe(false);
  });

  test('ignores other keys in the file', () => {
    const file = write(
      JSON.stringify({ oauth: 5, projects: { '/r/a': { x: 1 } } }),
    );
    expect(knownRoot('/r/a', file)).toBe(true);
  });
});

describe('claudeJsonPath', () => {
  test('puts the file in the home folder when no config folder is set', () => {
    const home = tmp();
    expect(claudeJsonPath({}, home)).toBe(path.join(home, '.claude.json'));
    expect(claudeJsonPath({ CLAUDE_CONFIG_DIR: '' }, home)).toBe(
      path.join(home, '.claude.json'),
    );
  });

  test('puts the file in the config folder when one is set', () => {
    const cfg = tmp();
    expect(claudeJsonPath({ CLAUDE_CONFIG_DIR: cfg }, tmp())).toBe(
      path.join(cfg, '.claude.json'),
    );
  });

  test('prefers a non-empty legacy .config.json in the config folder', () => {
    const cfg = tmp();
    fs.writeFileSync(path.join(cfg, '.config.json'), '{"projects":{}}');
    expect(claudeJsonPath({ CLAUDE_CONFIG_DIR: cfg }, tmp())).toBe(
      path.join(cfg, '.config.json'),
    );
  });

  test('prefers an empty writable legacy file only while the new file is absent', () => {
    const cfg = tmp();
    fs.writeFileSync(path.join(cfg, '.config.json'), '');
    expect(claudeJsonPath({ CLAUDE_CONFIG_DIR: cfg }, tmp())).toBe(
      path.join(cfg, '.config.json'),
    );
    fs.writeFileSync(path.join(cfg, '.claude.json'), '{}');
    expect(claudeJsonPath({ CLAUDE_CONFIG_DIR: cfg }, tmp())).toBe(
      path.join(cfg, '.claude.json'),
    );
  });

  test('looks for the legacy file in ~/.claude when no config folder is set', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.claude'));
    fs.writeFileSync(path.join(home, '.claude', '.config.json'), '{"a":1}');
    expect(claudeJsonPath({}, home)).toBe(
      path.join(home, '.claude', '.config.json'),
    );
  });
});
