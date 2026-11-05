import { describe, expect, test } from 'bun:test';
import { envWithoutRepoVars, REPO_LOCATING_VARS } from './git-env.js';

describe('envWithoutRepoVars', () => {
  test('drops every repo-locating variable and keeps the rest', () => {
    const repoVars = Object.fromEntries(
      REPO_LOCATING_VARS.map((k) => [k, 'x']),
    );
    const out = envWithoutRepoVars({
      ...repoVars,
      PATH: '/bin',
      GIT_AUTHOR_NAME: 'a',
    });
    expect(out).toEqual({ PATH: '/bin', GIT_AUTHOR_NAME: 'a' });
  });

  test('returns a copy and leaves its input alone', () => {
    const env = { GIT_DIR: '/x', PATH: '/bin' };
    envWithoutRepoVars(env);
    expect(env).toEqual({ GIT_DIR: '/x', PATH: '/bin' });
  });
});
