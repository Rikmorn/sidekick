import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { envWithoutRepoVars } from './git-env.js';
import { checkLoop, GITHUB_HOST_WARNING, type LoopDeps } from './loop-check.js';
import { ruleIssues } from './loop-rules.js';
import { keyHits } from './memory-patterns.js';
import { execRunner } from './pm-data.js';
import { PROFILE_NAME_RULE } from './profile-manifest.js';
import { oldStoreIssues } from './profile-old-store.js';
import { realPathOf } from './sidekick-home.js';

// The operator's git config and this worktree's repo variables stay out of the fixtures.
const GIT_ENV = {
  ...envWithoutRepoVars(process.env),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

const git = (cwd: string, ...args: string[]): void => {
  const r = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
};

let tmp: string;
let home: string;
let config: string;
let repo: string;
let managed: string;
let deps: LoopDeps;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-check-'));
  home = path.join(tmp, 'home');
  config = path.join(home, '.claude');
  repo = path.join(tmp, 'repo');
  managed = path.join(tmp, 'managed-settings.json');
  fs.mkdirSync(config, { recursive: true });
  fs.mkdirSync(repo);
  git(repo, 'init', '--quiet');
  git(repo, 'commit', '--quiet', '--allow-empty', '-m', 'first');
  deps = { env: {}, cwd: tmp, home, runGit: execRunner, managedFile: managed };
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const key = (): string => `token ${'ghp'}${'_'}${'a1'.repeat(18)}`;

const write = (file: string, content: string): string => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};
const writeJson = (file: string, value: unknown): string =>
  write(file, `${JSON.stringify(value, null, 2)}\n`);

const loopDir = (name = 'fixer', cfg = config): string =>
  path.join(cfg, 'sidekick', 'loops', name);
const loopFile = (name = 'fixer', cfg = config): string =>
  path.join(loopDir(name, cfg), 'loop.json');
const userStore = (cfg = config): string =>
  path.join(cfg, 'sidekick', 'profiles');

type Manifest = ReturnType<typeof validLoop>;
const validLoop = () => ({
  description: 'Fix bugs filed in the repo',
  repo,
  profile: 'fixer',
  schedule: '7 * * * *',
  tick: '/fixer:tick',
  hosts: ['registry.npmjs.org'],
  gates: ['bun run test'],
  caps: {
    attemptsPerUnit: 2,
    workMinutesPerUnit: 180,
    unitsPerDay: 4,
    failedUnitsInARow: 3,
  },
  mandate: {
    reads: [
      'Bash(gh issue view *)',
      'Bash(gh issue list *)',
      'Bash(git log --oneline -20)',
    ],
    classes: {
      triage: {
        state: 'record',
        allow: ['Bash(gh issue edit * --add-label *)'],
      },
    },
    never: ['Bash(git push --force *)'],
  },
});

const writeLoop = (
  edit: (m: Manifest) => void = () => {},
  name = 'fixer',
  cfg = config,
): string => {
  const m = validLoop();
  edit(m);
  return writeJson(loopFile(name, cfg), m);
};

const writeProfile = (
  root: string,
  manifest: Record<string, unknown> = { description: 'd' },
  name = 'fixer',
): string => {
  const dir = path.join(root, name);
  writeJson(path.join(dir, 'profile.json'), manifest);
  return dir;
};

describe('checkLoop: a valid loop', () => {
  test('passes with no issues or warnings, carrying its manifest and profile', () => {
    writeLoop();
    const dir = writeProfile(userStore());
    const check = checkLoop('fixer', deps);
    expect(check.issues).toEqual([]);
    expect(check.warnings).toEqual([]);
    expect(check.dir).toBe(loopDir());
    expect(check.manifest?.profile).toBe('fixer');
    expect(check.profile?.dir).toBe(dir);
    expect(check.profile?.store).toBe('user');
  });

  test('passes a key-shaped line in a record file and in state.json', () => {
    writeLoop();
    writeProfile(userStore());
    write(path.join(loopDir(), 'records', '2026-11-14.jsonl'), `${key()}\n`);
    write(path.join(loopDir(), 'state.json'), `{"note":"${key()}"}`);
    expect(checkLoop('fixer', deps).issues).toEqual([]);
  });

  test('passes a repo given through a linked path to the real folder', () => {
    const link = path.join(tmp, 'linked-repo');
    fs.symlinkSync(repo, link);
    writeLoop((m) => {
      m.repo = link;
    });
    writeProfile(userStore());
    expect(checkLoop('fixer', deps).issues).toEqual([]);
  });
});

describe('checkLoop: the definition', () => {
  test('refuses a name that breaks the profile name rule, before reading the folder', () => {
    writeLoop(() => {}, 'Bad_Name');
    writeProfile(userStore());
    const check = checkLoop('Bad_Name', deps);
    expect(check.issues).toEqual([
      `${loopDir('Bad_Name')}: "Bad_Name" is not a loop name: use ${PROFILE_NAME_RULE}`,
    ]);
    expect(check.manifest).toBeUndefined();
    expect(check.profile).toBeUndefined();
  });

  test('refuses a missing loop.json', () => {
    fs.mkdirSync(loopDir(), { recursive: true });
    const check = checkLoop('fixer', deps);
    expect(check.issues).toEqual([`${loopFile()}: missing`]);
    expect(check.manifest).toBeUndefined();
  });

  test('refuses a schema issue, reported with its path', () => {
    writeLoop((m) => {
      m.caps.unitsPerDay = 0;
    });
    writeProfile(userStore());
    expect(checkLoop('fixer', deps).issues).toEqual([
      `${loopFile()}: caps.unitsPerDay: must be at least 1`,
    ]);
  });
});

describe('checkLoop: the repo', () => {
  test('refuses a subfolder of a repo', () => {
    const sub = path.join(repo, 'sub');
    fs.mkdirSync(sub);
    writeLoop((m) => {
      m.repo = sub;
    });
    writeProfile(userStore());
    expect(checkLoop('fixer', deps).issues).toEqual([
      `${loopFile()}: repo: ${sub} is inside the work tree ${realPathOf(repo)}; name its main checkout's root`,
    ]);
  });

  test('refuses a linked worktree', () => {
    const linked = path.join(tmp, 'linked');
    git(repo, 'worktree', 'add', '--quiet', '--detach', linked);
    writeLoop((m) => {
      m.repo = linked;
    });
    writeProfile(userStore());
    const commonDir = path.join(realPathOf(repo), '.git');
    expect(checkLoop('fixer', deps).issues).toEqual([
      `${loopFile()}: repo: ${linked} keeps its git dir at ${commonDir}, as a linked worktree or a submodule does; name the main checkout's root`,
    ]);
  });

  test('refuses a folder that is not in a repo', () => {
    const plain = path.join(tmp, 'plain');
    fs.mkdirSync(plain);
    writeLoop((m) => {
      m.repo = plain;
    });
    writeProfile(userStore());
    expect(checkLoop('fixer', deps).issues).toEqual([
      `${loopFile()}: repo: ${plain} is not in a git repo; name a main checkout's root`,
    ]);
  });

  test('refuses a repo path that is not a folder', () => {
    const missing = path.join(tmp, 'none');
    writeLoop((m) => {
      m.repo = missing;
    });
    writeProfile(userStore());
    expect(checkLoop('fixer', deps).issues).toEqual([
      `${loopFile()}: repo: ${missing} is not a folder`,
    ]);
  });
});

describe('checkLoop: the profile', () => {
  test('refuses a profile no store holds, naming the stores searched', () => {
    writeLoop();
    const searched = [path.join(repo, '.claude', 'profiles'), userStore()];
    const check = checkLoop('fixer', deps);
    expect(check.issues).toEqual([
      `${loopFile()}: profile: no profile named "fixer"; searched: ${searched.join(', ')}`,
    ]);
    expect(check.profile).toBeUndefined();
  });

  test("refuses a profile the repo's .claude/profiles/ holds", () => {
    writeLoop();
    writeProfile(userStore());
    const dir = writeProfile(path.join(repo, '.claude', 'profiles'));
    const check = checkLoop('fixer', deps);
    expect(check.issues).toEqual([
      `${loopFile()}: profile: "fixer" resolves to the repo store's ${dir}, whose plugin code the repo's commits can change; keep the loop's profile in ${userStore()}`,
    ]);
    expect(check.profile?.store).toBe('repo');
  });

  test("passes through a held profile's own load issues", () => {
    writeLoop();
    const dir = writeProfile(userStore(), { description: '' });
    expect(checkLoop('fixer', deps).issues).toEqual([
      `${path.join(dir, 'profile.json')}: description: must not be empty`,
    ]);
  });

  test("refuses while the old store holds a profile, with oldStoreIssues' lines", () => {
    writeLoop();
    writeProfile(userStore());
    writeProfile(path.join(config, 'profiles'), { description: 'd' }, 'old');
    const lines = oldStoreIssues(deps.env, deps.cwd, deps.home);
    expect(lines.length).toBeGreaterThan(0);
    const check = checkLoop('fixer', deps);
    expect(check.issues).toEqual(lines);
    expect(check.profile).toBeUndefined();
  });

  test('refuses a role plugin folder that is missing', () => {
    writeLoop();
    const dir = writeProfile(userStore(), {
      description: 'd',
      pluginDirs: ['plugin'],
    });
    expect(checkLoop('fixer', deps).issues).toEqual([
      `${path.join(dir, 'profile.json')}: pluginDirs: ${path.join(dir, 'plugin')} is not a folder`,
    ]);
  });
});

describe('checkLoop: keys', () => {
  test('refuses a key in loop.json, naming its id and never the key', () => {
    writeLoop((m) => {
      m.description = key();
    });
    writeProfile(userStore());
    const issues = checkLoop('fixer', deps).issues;
    expect(issues).toEqual([
      `${loopFile()}: the key check flags it (github-classic-pat); keep keys out of a loop's folder`,
    ]);
    expect(issues.join('\n')).not.toContain('a1a1a1');
  });

  test('refuses a key in a broken loop.json beside its parse issue', () => {
    write(loopFile(), key());
    const issues = checkLoop('fixer', deps).issues;
    expect(issues).toHaveLength(2);
    expect(issues[0]).toStartWith(`${loopFile()}: invalid JSON: `);
    expect(issues[1]).toBe(
      `${loopFile()}: the key check flags it (github-classic-pat); keep keys out of a loop's folder`,
    );
  });

  test('skips the runtime entries only at the top of the folder', () => {
    writeLoop();
    writeProfile(userStore());
    const nested = write(path.join(loopDir(), 'notes', 'state.json'), key());
    expect(checkLoop('fixer', deps).issues).toEqual([
      `${nested}: the key check flags it (github-classic-pat); keep keys out of a loop's folder`,
    ]);
  });
});

describe('checkLoop: rules', () => {
  test('refuses a rule ruleIssues refuses, once per list, at its dot path', () => {
    const refused = {
      reads: 'Bash(bash -c *)',
      allow: 'Bash(claude *)',
      never: 'Write(src/**)',
    };
    writeLoop((m) => {
      m.mandate.reads.push(refused.reads);
      m.mandate.classes.triage.allow.push(refused.allow);
      m.mandate.never.push(refused.never);
    });
    writeProfile(userStore());
    const at = (
      dotPath: string,
      rule: string,
      list: 'reads' | 'allow' | 'never',
    ) => {
      const whys = ruleIssues(rule, list, repo);
      expect(whys.length).toBeGreaterThan(0);
      return whys.map((why) => `${loopFile()}: ${dotPath}: ${why}`);
    };
    expect(checkLoop('fixer', deps).issues).toEqual([
      ...at('mandate.reads.3', refused.reads, 'reads'),
      ...at('mandate.classes.triage.allow.1', refused.allow, 'allow'),
      ...at('mandate.never.1', refused.never, 'never'),
    ]);
  });
});

describe('checkLoop: github warnings', () => {
  test('warns on hosts holding github.com, naming loop.json and the host', () => {
    writeLoop((m) => {
      m.hosts = ['registry.npmjs.org', 'GitHub.com'];
    });
    writeProfile(userStore());
    const check = checkLoop('fixer', deps);
    expect(check.issues).toEqual([]);
    expect(check.warnings).toEqual([
      `${loopFile()}: hosts: GitHub.com: ${GITHUB_HOST_WARNING}`,
    ]);
  });

  test("warns on a kept layer's allowedDomains holding *.github.com", () => {
    writeLoop();
    writeProfile(userStore());
    const project = writeJson(path.join(repo, '.claude', 'settings.json'), {
      sandbox: { network: { allowedDomains: ['*.github.com'] } },
    });
    expect(checkLoop('fixer', deps).warnings).toEqual([
      `${project}: sandbox.network.allowedDomains: *.github.com: ${GITHUB_HOST_WARNING}`,
    ]);
  });

  test('warns on github.com and its subdomains, and on a wildcard over them', () => {
    writeLoop();
    writeProfile(userStore());
    const reaching = [
      'github.com',
      'api.github.com',
      '*.github.com',
      '*.com',
      'API.GitHub.COM',
    ];
    const missing = ['githubusercontent.com', 'notgithub.com', '*.example.com'];
    const user = writeJson(path.join(config, 'settings.json'), {
      sandbox: { network: { allowedDomains: [...missing, ...reaching] } },
    });
    expect(checkLoop('fixer', deps).warnings).toEqual(
      reaching.map(
        (host) =>
          `${user}: sandbox.network.allowedDomains: ${host}: ${GITHUB_HOST_WARNING}`,
      ),
    );
  });

  test("names the profile layer's settings path", () => {
    writeLoop();
    const dir = writeProfile(userStore(), {
      description: 'd',
      settings: { sandbox: { network: { allowedDomains: ['github.com'] } } },
    });
    expect(checkLoop('fixer', deps).warnings).toEqual([
      `${path.join(dir, 'profile.json')}: settings.sandbox.network.allowedDomains: github.com: ${GITHUB_HOST_WARNING}`,
    ]);
  });

  test('reads the managed file it is given', () => {
    writeLoop();
    writeProfile(userStore());
    writeJson(managed, {
      sandbox: { network: { allowedDomains: ['github.com'] } },
    });
    expect(checkLoop('fixer', deps).warnings).toEqual([
      `${managed}: sandbox.network.allowedDomains: github.com: ${GITHUB_HOST_WARNING}`,
    ]);
  });

  test('turns a kept layer that is not JSON into a warning, and goes on', () => {
    writeLoop((m) => {
      m.hosts = ['github.com'];
    });
    writeProfile(userStore());
    const local = write(
      path.join(repo, '.claude', 'settings.local.json'),
      '{ not json',
    );
    const check = checkLoop('fixer', deps);
    expect(check.issues).toEqual([]);
    expect(check.warnings).toHaveLength(2);
    expect(check.warnings[0]).toBe(
      `${loopFile()}: hosts: github.com: ${GITHUB_HOST_WARNING}`,
    );
    expect(check.warnings[1]).toStartWith(
      `${local}: the check cannot read it, so it cannot see the hosts it lets workers reach: `,
    );
  });
});

describe('checkLoop: CLAUDE_CONFIG_DIR', () => {
  test('reads the loop store, the profile store, and the user layer under it', () => {
    const cfg = path.join(tmp, 'other-config');
    const env = { CLAUDE_CONFIG_DIR: cfg };
    writeLoop(() => {}, 'fixer', cfg);
    const dir = writeProfile(userStore(cfg));
    const user = writeJson(path.join(cfg, 'settings.json'), {
      sandbox: { network: { allowedDomains: ['github.com'] } },
    });
    const check = checkLoop('fixer', { ...deps, env });
    expect(check.dir).toBe(loopDir('fixer', cfg));
    expect(check.issues).toEqual([]);
    expect(check.profile?.dir).toBe(dir);
    expect(check.warnings).toEqual([
      `${user}: sandbox.network.allowedDomains: github.com: ${GITHUB_HOST_WARNING}`,
    ]);
  });
});

test('this test file holds no literal key', () => {
  expect(keyHits(fs.readFileSync(import.meta.path, 'utf8'))).toEqual([]);
});
