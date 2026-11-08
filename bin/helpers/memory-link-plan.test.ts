import { describe, expect, test } from 'bun:test';
import { planLink } from './memory-link-plan.js';
import type {
  CopyState,
  DefaultFolder,
  LinkAction,
  LinkFacts,
  LinkPlan,
  PlanOptions,
  RepoFacts,
  SessionFacts,
  TargetFacts,
} from './memory-link-types.js';
import type { SettingsState } from './memory-settings.js';
import type { Job } from './worker-jobs.js';

const ROOT = '/x/odin';
const STORE = '/s/store';
const TARGET = '/s/store/odin';
const HOME = '/s';
const KEY = '-x-odin';
const DEFAULT = `/c/projects/${KEY}/memory`;
const SETTINGS_FILE = '/x/odin/.claude/settings.local.json';
const TODAY = '2026-11-01';
const ARCHIVED = `/s/store/archive/default-folders/${KEY}-${TODAY}`;
const NO_FLAGS: PlanOptions = {
  family: undefined,
  name: undefined,
  force: false,
  dryRun: false,
};
const FORCE: PlanOptions = { ...NO_FLAGS, force: true };

const job = (sessionId: string, cwd: string): Job => ({
  id: undefined,
  kind: 'interactive',
  name: undefined,
  cwd,
  sessionId,
  state: undefined,
});

function settings(key?: string): SettingsState {
  const parsed = key === undefined ? {} : { autoMemoryDirectory: key };
  return {
    kind: 'ready',
    file: SETTINGS_FILE,
    text: JSON.stringify(parsed),
    settings: parsed,
    key,
  };
}

const present = (files: [string, CopyState][]): DefaultFolder => ({
  kind: 'present',
  folder: DEFAULT,
  files: files.map(([rel, copy]) => ({ rel, copy })),
  issues: [],
});

const ABSENT_DEFAULT: DefaultFolder = { kind: 'absent', folder: DEFAULT };

function target(over: Partial<TargetFacts> = {}): TargetFacts {
  return {
    folder: TARGET,
    rel: 'odin',
    state: { kind: 'absent' },
    family: 'none',
    elsewhere: [],
    archives: [],
    pending: { paths: [] },
    ...over,
  };
}

function repo(over: Partial<RepoFacts> = {}): RepoFacts {
  return {
    kind: 'found',
    root: ROOT,
    settings: settings(),
    home: HOME,
    projectKey: KEY,
    keyMissed: undefined,
    defaultFolder: present([
      ['MEMORY.md', 'absent'],
      ['notes.md', 'absent'],
    ]),
    sessions: { kind: 'listed', self: undefined, others: [] },
    target: target(),
    ...over,
  };
}

function facts(over: Partial<LinkFacts> = {}): LinkFacts {
  return {
    store: STORE,
    storeState: { kind: 'store' },
    storePending: { paths: [] },
    overrideIssue: undefined,
    nameIssues: [],
    repo: repo(),
    userSettings: { file: '/c/settings.json', covered: true },
    today: TODAY,
    ...over,
  };
}

function actionsOf(plan: LinkPlan): LinkAction[] {
  if (plan.kind !== 'ready') {
    throw new Error(`refused: ${plan.refusals.join(' | ')}`);
  }
  return plan.actions;
}

function notesOf(plan: LinkPlan): string[] {
  if (plan.kind !== 'ready') throw new Error('refused');
  return plan.notes;
}

function refusalsOf(plan: LinkPlan): string[] {
  if (plan.kind !== 'refused') throw new Error('expected a refusal');
  return plan.refusals;
}

// Every phase commits the same owned set; the bytes decide which files are copies.
const COMMIT: LinkAction = {
  kind: 'commit',
  store: STORE,
  message: 'link odin',
  owned: { folderRel: 'odin', projectKey: KEY, defaultFolder: DEFAULT },
};

const copy = (rel: string): LinkAction => ({
  kind: 'copyFile',
  from: `${DEFAULT}/${rel}`,
  to: `${TARGET}/${rel}`,
});

const MERGE: LinkAction = {
  kind: 'mergeKey',
  file: SETTINGS_FILE,
  value: TARGET,
  expected: '{}',
};

const archive = (to: string, reappeared: boolean): LinkAction => ({
  kind: 'archiveDefault',
  from: DEFAULT,
  to,
  copies: TARGET,
  reappeared,
});

const MARKED = target({ state: { kind: 'marked', root: ROOT } });

describe('planLink: a first link', () => {
  test('creates the store, fills the folder, sets the key, archives, and commits, in that order', () => {
    const plan = planLink(facts({ storeState: { kind: 'absent' } }), NO_FLAGS);
    expect(actionsOf(plan)).toEqual([
      { kind: 'createStore', store: STORE },
      { kind: 'createFolder', folder: TARGET },
      { kind: 'writeMarker', folder: TARGET, root: ROOT },
      copy('MEMORY.md'),
      copy('notes.md'),
      MERGE,
      archive(ARCHIVED, false),
      COMMIT,
    ]);
  });

  test('a key equal to the folder but no marker naming the root is not yet in place, so it copies', () => {
    for (const state of [
      { kind: 'absent' } as const,
      { kind: 'empty' } as const,
    ]) {
      const plan = planLink(
        facts({
          repo: repo({ settings: settings(TARGET), target: target({ state }) }),
        }),
        NO_FLAGS,
      );
      const actions = actionsOf(plan);
      expect(actions).toContainEqual(copy('MEMORY.md'));
      expect(actions).toContainEqual(copy('notes.md'));
      expect(actions).toContainEqual(archive(ARCHIVED, false));
      expect(actions).toContainEqual({
        kind: 'writeMarker',
        folder: TARGET,
        root: ROOT,
      });
    }
  });

  test('an empty store folder becomes the store', () => {
    const plan = planLink(facts({ storeState: { kind: 'empty' } }), NO_FLAGS);
    expect(actionsOf(plan)[0]).toEqual({ kind: 'createStore', store: STORE });
  });

  test('a store whose creation stopped part-way is created, then linked, as an absent one is', () => {
    const plan = planLink(
      facts({ storeState: { kind: 'unfinished' } }),
      NO_FLAGS,
    );
    expect(actionsOf(plan)).toEqual(
      actionsOf(planLink(facts({ storeState: { kind: 'absent' } }), NO_FLAGS)),
    );
  });

  test('a family puts the folder under it and names it in the commit', () => {
    const folder = '/s/store/fam/odin';
    const plan = planLink(
      facts({
        repo: repo({
          defaultFolder: ABSENT_DEFAULT,
          target: target({ folder, rel: 'fam/odin', family: 'absent' }),
        }),
      }),
      { ...NO_FLAGS, family: 'fam' },
    );
    expect(actionsOf(plan)).toEqual([
      { kind: 'createFolder', folder },
      { kind: 'writeMarker', folder, root: ROOT },
      { ...MERGE, value: folder },
      {
        kind: 'commit',
        store: STORE,
        message: 'link fam/odin',
        owned: {
          folderRel: 'fam/odin',
          projectKey: KEY,
          defaultFolder: DEFAULT,
        },
      },
    ]);
  });

  test('with no default folder, copies and archives nothing, and says which path it checked', () => {
    const plan = planLink(
      facts({ repo: repo({ defaultFolder: ABSENT_DEFAULT }) }),
      NO_FLAGS,
    );
    expect(actionsOf(plan)).toEqual([
      { kind: 'createFolder', folder: TARGET },
      { kind: 'writeMarker', folder: TARGET, root: ROOT },
      MERGE,
      COMMIT,
    ]);
    expect(notesOf(plan).join('\n')).toContain(DEFAULT);
  });

  test('copies nested files and skips one already identical in the store', () => {
    const plan = planLink(
      facts({
        repo: repo({
          defaultFolder: present([
            ['MEMORY.md', 'same'],
            ['sessions/2026-11-01-a.md', 'absent'],
          ]),
        }),
      }),
      NO_FLAGS,
    );
    const copies = actionsOf(plan).filter((a) => a.kind === 'copyFile');
    expect(copies).toEqual([copy('sessions/2026-11-01-a.md')]);
  });

  test('an archive name already taken gets the next free suffix', () => {
    const plan = planLink(
      facts({
        repo: repo({
          target: target({
            archives: [`${KEY}-${TODAY}`, `${KEY}-${TODAY}-2`],
          }),
        }),
      }),
      NO_FLAGS,
    );
    expect(actionsOf(plan)).toContainEqual(archive(`${ARCHIVED}-3`, false));
  });
});

describe('planLink: a re-run after each action', () => {
  test('after the store: the same plan without creating it', () => {
    const actions = actionsOf(planLink(facts(), NO_FLAGS));
    expect(actions[0]).toEqual({ kind: 'createFolder', folder: TARGET });
    expect(actions.some((a) => a.kind === 'createStore')).toBe(false);
  });

  test("after the store's failed first commit: commits its own files first, then the same plan", () => {
    const paths = ['README.md', 'sources/.gitkeep', 'archive/.gitkeep'];
    const actions = actionsOf(
      planLink(facts({ storePending: { paths } }), NO_FLAGS),
    );
    expect(actions[0]).toEqual({ kind: 'finishStore', store: STORE, paths });
    expect(actions.slice(1)).toEqual(actionsOf(planLink(facts(), NO_FLAGS)));
  });

  test("after the store's failed first commit, on a linked repo: that commit is the one step", () => {
    const paths = ['README.md'];
    const plan = planLink(
      facts({
        storePending: { paths },
        repo: repo({
          settings: settings(TARGET),
          defaultFolder: ABSENT_DEFAULT,
          target: MARKED,
        }),
      }),
      NO_FLAGS,
    );
    expect(actionsOf(plan)).toEqual([
      { kind: 'finishStore', store: STORE, paths },
    ]);
  });

  test('after the folder: writes the marker into the empty folder', () => {
    const plan = planLink(
      facts({ repo: repo({ target: target({ state: { kind: 'empty' } }) }) }),
      NO_FLAGS,
    );
    expect(actionsOf(plan).slice(0, 2)).toEqual([
      { kind: 'writeMarker', folder: TARGET, root: ROOT },
      copy('MEMORY.md'),
    ]);
  });

  test('after the marker: copies, with no folder or marker step', () => {
    const plan = planLink(facts({ repo: repo({ target: MARKED }) }), NO_FLAGS);
    expect(actionsOf(plan)).toEqual([
      copy('MEMORY.md'),
      copy('notes.md'),
      MERGE,
      archive(ARCHIVED, false),
      COMMIT,
    ]);
  });

  test('after the copies: sets the key, archives, and commits', () => {
    const plan = planLink(
      facts({
        repo: repo({
          target: MARKED,
          defaultFolder: present([
            ['MEMORY.md', 'same'],
            ['notes.md', 'same'],
          ]),
        }),
      }),
      NO_FLAGS,
    );
    expect(actionsOf(plan)).toEqual([MERGE, archive(ARCHIVED, false), COMMIT]);
  });

  test('after the key: archives the default folder as it is, copying nothing', () => {
    const plan = planLink(
      facts({
        repo: repo({
          settings: settings(TARGET),
          target: MARKED,
          defaultFolder: present([
            ['MEMORY.md', 'same'],
            ['notes.md', 'same'],
          ]),
        }),
      }),
      NO_FLAGS,
    );
    expect(actionsOf(plan)).toEqual([archive(ARCHIVED, true), COMMIT]);
  });

  test('after the archive: commits what an earlier run left', () => {
    const plan = planLink(
      facts({
        repo: repo({
          settings: settings(TARGET),
          defaultFolder: ABSENT_DEFAULT,
          target: target({
            state: { kind: 'marked', root: ROOT },
            pending: {
              paths: [
                'odin/.sidekick.json',
                `archive/default-folders/${KEY}-${TODAY}/MEMORY.md`,
              ],
            },
          }),
        }),
      }),
      NO_FLAGS,
    );
    expect(actionsOf(plan)).toEqual([COMMIT]);
  });

  test('after the commit: nothing to do, so the repo is already linked', () => {
    const plan = planLink(
      facts({
        repo: repo({
          settings: settings(TARGET),
          defaultFolder: ABSENT_DEFAULT,
          target: MARKED,
        }),
      }),
      NO_FLAGS,
    );
    expect(plan).toEqual({
      kind: 'ready',
      root: ROOT,
      target: TARGET,
      actions: [],
      notes: [],
    });
  });
});

describe('planLink: a default folder that reappears after the link', () => {
  test('is archived as it is, under a new name, with no copy and no merge', () => {
    const plan = planLink(
      facts({
        repo: repo({
          settings: settings(TARGET),
          target: target({
            state: { kind: 'marked', root: ROOT },
            archives: [`${KEY}-${TODAY}`],
          }),
          defaultFolder: present([
            ['MEMORY.md', 'differs'],
            ['new.md', 'absent'],
          ]),
        }),
      }),
      NO_FLAGS,
    );
    expect(actionsOf(plan)).toEqual([archive(`${ARCHIVED}-2`, true), COMMIT]);
  });

  test('is archived even when it holds a top-level marker file, since nothing is copied', () => {
    const plan = planLink(
      facts({
        repo: repo({
          settings: settings(TARGET),
          target: MARKED,
          defaultFolder: present([['.sidekick.json', 'differs']]),
        }),
      }),
      NO_FLAGS,
    );
    expect(actionsOf(plan)[0]).toEqual(archive(ARCHIVED, true));
  });
});

describe('planLink: sessions', () => {
  const other = job('other', '/x/odin/src');

  test('another session in the repo refuses, naming it and the way forward', () => {
    const plan = planLink(
      facts({
        repo: repo({
          sessions: { kind: 'listed', self: undefined, others: [other] },
        }),
      }),
      NO_FLAGS,
    );
    const [refusal] = refusalsOf(plan);
    expect(refusal).toContain('other in /x/odin/src');
    expect(refusal).toContain('sidekick memory link /x/odin --force');
  });

  test('--force passes over other sessions and reports them', () => {
    const plan = planLink(
      facts({
        repo: repo({
          sessions: { kind: 'listed', self: undefined, others: [other] },
        }),
      }),
      FORCE,
    );
    expect(actionsOf(plan)).toContainEqual(MERGE);
    expect(notesOf(plan).join('\n')).toContain('other in /x/odin/src');
  });

  test('a failed listing refuses, and --force passes over it and says the check did not run', () => {
    const failed = repo({
      sessions: { kind: 'failed', issues: ['claude agents failed.'] },
    });
    expect(
      refusalsOf(planLink(facts({ repo: failed }), NO_FLAGS))[0],
    ).toContain('claude agents failed.');
    const forced = notesOf(planLink(facts({ repo: failed }), FORCE));
    expect(forced.join('\n')).toContain('did not run');
  });

  test('the session running link never refuses, and is told to restart', () => {
    const plan = planLink(
      facts({
        repo: repo({
          sessions: {
            kind: 'listed',
            self: job('me', '/x/odin'),
            others: [],
          },
        }),
      }),
      NO_FLAGS,
    );
    const notes = notesOf(plan).join('\n');
    expect(notes).toContain('me');
    expect(notes).toContain('restart');
  });

  test('open sessions do not refuse a run that moves nothing', () => {
    const plan = planLink(
      facts({
        repo: repo({
          settings: settings(TARGET),
          defaultFolder: ABSENT_DEFAULT,
          target: MARKED,
          sessions: { kind: 'listed', self: undefined, others: [other] },
        }),
      }),
      NO_FLAGS,
    );
    expect(actionsOf(plan)).toEqual([]);
  });
});

describe('planLink: sessions on a re-run that only commits', () => {
  const other = job('other', '/x/odin/src');
  const commitOnly = (sessions: SessionFacts) =>
    facts({
      repo: repo({
        settings: settings(TARGET),
        defaultFolder: ABSENT_DEFAULT,
        sessions,
        target: target({
          state: { kind: 'marked', root: ROOT },
          pending: { paths: ['odin/.sidekick.json'] },
        }),
      }),
    });

  test.each([
    ['without --force', NO_FLAGS],
    ['with --force', FORCE],
  ])('names an open session and never claims --force, %s', (_label, opts) => {
    const plan = planLink(
      commitOnly({ kind: 'listed', self: undefined, others: [other] }),
      opts,
    );
    expect(actionsOf(plan)).toEqual([COMMIT]);
    const notes = notesOf(plan).join('\n');
    expect(notes).toContain('other in /x/odin/src');
    expect(notes).toContain(DEFAULT);
    expect(notes).not.toContain('--force');
  });

  test.each([
    ['without --force', NO_FLAGS],
    ['with --force', FORCE],
  ])('a failed listing says the check did not run, %s', (_label, opts) => {
    const plan = planLink(
      commitOnly({ kind: 'failed', issues: ['claude agents failed.'] }),
      opts,
    );
    const notes = notesOf(plan).join('\n');
    expect(notes).toContain('did not run');
    expect(notes).toContain('claude agents failed.');
    expect(notes).not.toContain('--force');
  });

  test('the session running link is told to restart if it began before the key', () => {
    const plan = planLink(
      commitOnly({ kind: 'listed', self: job('me', '/x/odin'), others: [] }),
      NO_FLAGS,
    );
    const notes = notesOf(plan).join('\n');
    expect(notes).toContain('me');
    expect(notes).toContain('restart');
    expect(notes).toContain('started before');
  });

  test('no session note when no session is open', () => {
    const plan = planLink(
      commitOnly({ kind: 'listed', self: undefined, others: [] }),
      NO_FLAGS,
    );
    expect(notesOf(plan)).toEqual([]);
  });

  test('a run that plans no commit prints no session note', () => {
    const plan = planLink(
      facts({
        repo: repo({
          settings: settings(TARGET),
          defaultFolder: ABSENT_DEFAULT,
          target: MARKED,
          sessions: { kind: 'listed', self: undefined, others: [other] },
        }),
      }),
      NO_FLAGS,
    );
    expect(notesOf(plan)).toEqual([]);
  });
});

describe('planLink: the user settings', () => {
  test('prints the entry to add when no additionalDirectories entry covers the store', () => {
    const plan = planLink(
      facts({
        store: '/s/my store',
        repo: repo({
          defaultFolder: ABSENT_DEFAULT,
          target: target({ folder: '/s/my store/odin' }),
        }),
        userSettings: { file: '/c/settings.json', covered: false },
      }),
      NO_FLAGS,
    );
    const notes = notesOf(plan).join('\n');
    expect(notes).toContain('/c/settings.json');
    expect(notes).toContain('"/s/my store"');
  });
});

describe('planLink: refusals', () => {
  const refusals = (over: Partial<LinkFacts>, opts = NO_FLAGS): string[] =>
    refusalsOf(planLink(facts(over), opts));

  test('a store folder that is not a store', () => {
    const [refusal] = refusals({
      storeState: { kind: 'foreign', issue: '/s/store holds files' },
    });
    expect(refusal).toContain('/s/store holds files');
    expect(refusal).toContain('SIDEKICK_MEMORY_STORE');
  });

  test('a stopped store creation beside paths link did not write is refused in its own words, which name the way forward', () => {
    const issue =
      '/s/store is a store whose creation stopped part-way, and it also holds notes.md, which link did not write. Move them out of /s/store, then run link again to finish the store.';
    expect(refusals({ storeState: { kind: 'cluttered', issue } })).toEqual([
      issue,
    ]);
  });

  test('an override variable', () => {
    expect(refusals({ overrideIssue: 'X is set' })[0]).toContain('X is set');
  });

  test('an override variable is refused in its own words, which name the variable to unset', () => {
    const issue =
      'X is set, so Claude Code keeps memory elsewhere. Unset X and run link again.';
    expect(refusals({ overrideIssue: issue })).toEqual([issue]);
  });

  test('a reserved or malformed family or folder name', () => {
    const [refusal] = refusals({
      nameIssues: ['"archive" is a reserved name'],
      repo: repo({ target: undefined }),
    });
    expect(refusal).toContain('"archive" is a reserved name');
    expect(refusal).toContain('--name');
  });

  test('a refused name still reports the default folder and session refusals', () => {
    const got = refusals({
      nameIssues: ['".x" cannot start with "."'],
      repo: repo({
        target: undefined,
        defaultFolder: ABSENT_DEFAULT,
        sessions: {
          kind: 'listed',
          self: undefined,
          others: [job('o', '/x/odin')],
        },
      }),
    });
    expect(got).toHaveLength(2);
    expect(got[1]).toContain('--force');
  });

  test('a path with no main checkout', () => {
    expect(
      refusals({ repo: { kind: 'refused', issue: '/x has no main checkout' } }),
    ).toEqual(['/x has no main checkout']);
  });

  test('a settings file that is tracked, not ignored, or not JSON', () => {
    const [refusal] = refusals({
      repo: repo({ settings: { kind: 'refused', issue: 'not ignored' } }),
    });
    expect(refusal).toBe('not ignored');
  });

  test('a key that names another folder', () => {
    const [refusal] = refusals({
      repo: repo({ settings: settings('/elsewhere/odin') }),
    });
    expect(refusal).toContain('/elsewhere/odin');
    expect(refusal).toContain('README');
  });

  test('a key written as ~/ that names the folder is its own, as the absolute key is', () => {
    for (const state of [MARKED.state, { kind: 'absent' } as const]) {
      const plan = (key: string): LinkPlan =>
        planLink(
          facts({
            repo: repo({ settings: settings(key), target: target({ state }) }),
          }),
          NO_FLAGS,
        );
      const tilde = actionsOf(plan('~/store/odin'));
      expect(tilde).toEqual(actionsOf(plan(TARGET)));
      // mergeKey compares the key's text, so it would refuse to replace `~/…` after the copies.
      expect(tilde.some((action) => action.kind === 'mergeKey')).toBe(false);
    }
  });

  test('a project folder that is absent though .claude.json lists the root', () => {
    const [refusal] = refusals({
      repo: repo({
        keyMissed: {
          claudeJson: '/c/.claude.json',
          projectFolder: `/c/projects/${KEY}`,
        },
      }),
    });
    expect(refusal).toBe(
      `/c/.claude.json lists ${ROOT}, but /c/projects/${KEY} is absent, so Claude Code names its project folders by a rule link does not know. Its folder is somewhere under /c/projects. To ask for support, run: gh issue create -R Rikmorn/sidekick --title 'memory link: a project folder named by a rule link does not know' --body 'sidekick memory link found no project folder where it computes one, for a repo that .claude.json lists.'`,
    );
  });

  test('a default folder holding a link out of it', () => {
    const [refusal] = refusals({
      repo: repo({
        defaultFolder: {
          kind: 'present',
          folder: DEFAULT,
          files: [],
          issues: [`${DEFAULT}/x.md is a link out of the folder`],
        },
      }),
    });
    expect(refusal).toContain('x.md is a link');
  });

  test('a top-level marker file in the default folder, during a first link', () => {
    const [refusal] = refusals({
      repo: repo({ defaultFolder: present([['.sidekick.json', 'absent']]) }),
    });
    expect(refusal).toContain(`${DEFAULT}/.sidekick.json`);
  });

  test('a file that differs from the store copy, during a first link, naming it', () => {
    const [refusal] = refusals({
      repo: repo({
        target: MARKED,
        defaultFolder: present([
          ['MEMORY.md', 'same'],
          ['sessions/a.md', 'differs'],
        ]),
      }),
    });
    expect(refusal).toContain(`${DEFAULT}/sessions/a.md`);
    expect(refusal).toContain(`${TARGET}/sessions/a.md`);
  });

  test('a store path in the way of a copy', () => {
    const [refusal] = refusals({
      repo: repo({
        target: MARKED,
        defaultFolder: present([['sessions', 'notFile']]),
      }),
    });
    expect(refusal).toContain(`${TARGET}/sessions`);
  });

  test('a target that is a file', () => {
    const [refusal] = refusals({
      repo: repo({ target: target({ state: { kind: 'notFolder' } }) }),
    });
    expect(refusal).toContain(TARGET);
    expect(refusal).toContain('--name');
  });

  test('a target holding files and no marker', () => {
    const [refusal] = refusals({
      repo: repo({ target: target({ state: { kind: 'unmarked' } }) }),
    });
    expect(refusal).toContain(TARGET);
    expect(refusal).toContain('--name');
  });

  test('a target whose marker cannot be read', () => {
    const [refusal] = refusals({
      repo: repo({
        target: target({
          state: { kind: 'invalidMarker', issue: 'marker is not JSON' },
        }),
      }),
    });
    expect(refusal).toContain('marker is not JSON');
  });

  test('a target whose marker names another root', () => {
    const [refusal] = refusals({
      repo: repo({
        target: target({ state: { kind: 'marked', root: '/y/odin' } }),
      }),
    });
    expect(refusal).toContain('/y/odin');
    expect(refusal).toContain('--name');
  });

  test('a family folder that holds a marker, or is a file', () => {
    for (const family of ['marked', 'notFolder'] as const) {
      const [refusal] = refusals(
        {
          repo: repo({
            target: target({
              folder: '/s/store/fam/odin',
              rel: 'fam/odin',
              family,
            }),
          }),
        },
        { ...NO_FLAGS, family: 'fam' },
      );
      expect(refusal).toContain('/s/store/fam');
      expect(refusal).toContain('--family');
    }
  });

  test('the repo already linked at another folder, with the command that finishes it', () => {
    const [refusal] = refusals({
      repo: repo({
        target: target({
          elsewhere: [{ folder: '/s/store/fam/odin', family: 'fam' }],
        }),
      }),
    });
    expect(refusal).toContain('/s/store/fam/odin');
    expect(refusal).toContain(
      'sidekick memory link /x/odin --family fam --name odin',
    );
  });

  test('a store git cannot read for an earlier run', () => {
    const [refusal] = refusals({
      repo: repo({
        target: target({ pending: { issue: 'git status failed' } }),
      }),
    });
    expect(refusal).toContain('git status failed');
  });

  test("a store git cannot read for the store's own files, reported once when both lists fail alike", () => {
    const issue = 'git status failed in /s/store: broken';
    const alone = refusals({ storePending: { issue } });
    expect(alone).toEqual([
      `${issue}. Fix the store's git repo, then run link again.`,
    ]);
    const both = refusals({
      storePending: { issue },
      repo: repo({ target: target({ pending: { issue } }) }),
    });
    expect(both).toEqual(alone);
  });

  test('reports every refusal that applies, not only the first', () => {
    const got = refusals({
      overrideIssue: 'X is set',
      repo: repo({
        settings: { kind: 'refused', issue: 'not ignored' },
        target: target({ state: { kind: 'unmarked' } }),
        sessions: {
          kind: 'listed',
          self: undefined,
          others: [job('o', '/x/odin')],
        },
      }),
    });
    expect(got).toHaveLength(4);
  });

  test('a command in a refusal quotes a root with a space', () => {
    const [refusal] = refusalsOf(
      planLink(
        facts({
          repo: repo({
            root: '/x/my repo',
            sessions: {
              kind: 'listed',
              self: undefined,
              others: [job('o', '/x/my repo')],
            },
          }),
        }),
        NO_FLAGS,
      ),
    );
    expect(refusal).toContain("sidekick memory link '/x/my repo' --force");
  });
});

describe('planLink: suggested commands under --dry-run', () => {
  const ODD_ROOT = "/x/o din's repo";
  const QUOTED_ROOT = `'/x/o din'\\''s repo'`;
  const DRY: PlanOptions = { ...NO_FLAGS, dryRun: true };
  const busy = (root: string) =>
    repo({
      root,
      sessions: {
        kind: 'listed',
        self: undefined,
        others: [job('other', `${root}/src`)],
      },
    });
  const linkedElsewhere = (root: string) =>
    repo({
      root,
      target: target({
        elsewhere: [{ folder: '/s/store/fam/odin', family: 'fam' }],
      }),
    });
  const first = (r: RepoFacts, opts: PlanOptions): string =>
    refusalsOf(planLink(facts({ repo: r }), opts))[0] ?? '';

  test('a dry run with another session open suggests --force --dry-run', () => {
    expect(first(busy(ROOT), DRY)).toEndWith(
      'sidekick memory link /x/odin --force --dry-run',
    );
  });

  test('a dry run for a repo linked elsewhere finishes it with --dry-run', () => {
    expect(first(linkedElsewhere(ROOT), DRY)).toEndWith(
      'sidekick memory link /x/odin --family fam --name odin --dry-run',
    );
  });

  test('a real run suggests commands with no --dry-run', () => {
    expect(first(busy(ROOT), NO_FLAGS)).not.toContain('--dry-run');
    expect(first(linkedElsewhere(ROOT), NO_FLAGS)).not.toContain('--dry-run');
  });

  test('a repo path with a space and a quote keeps its quoting under --dry-run', () => {
    expect(first(busy(ODD_ROOT), DRY)).toEndWith(
      `sidekick memory link ${QUOTED_ROOT} --force --dry-run`,
    );
    expect(first(linkedElsewhere(ODD_ROOT), DRY)).toEndWith(
      `sidekick memory link ${QUOTED_ROOT} --family fam --name odin --dry-run`,
    );
  });

  test('a dry run keeps --family and --name in the --force retry', () => {
    expect(
      first(busy(ROOT), { ...DRY, family: 'fam', name: 'odin' }),
    ).toEndWith(
      'sidekick memory link /x/odin --family fam --name odin --force --dry-run',
    );
  });
});
