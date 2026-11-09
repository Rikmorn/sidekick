import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import type { ProfileManifest, SettingSource } from './profile-manifest.js';
import {
  checkPlugins,
  judgePluginList,
  needsPluginCheck,
  PLUGIN_SKIP_VARIABLE,
  type PluginCheckTarget,
} from './profile-plugins.js';

const entry = (id: string, details?: unknown) =>
  details === undefined
    ? { id, scope: 'user', enabled: true }
    : { id, scope: 'user', enabled: true, errorDetails: details };

const unsatisfied = {
  type: 'dependency-unsatisfied',
  plugin: 'sidekick',
  dependency: 'superpowers@claude-plugins-official',
};

const issuesOf = (r: ReturnType<typeof judgePluginList>): string[] =>
  r.ok ? [] : r.issues;

const bare: ProfileManifest = { description: 'd' };

// A manifest whose settings.enabledPlugins sets each id true.
const naming = (...ids: string[]): ProfileManifest => ({
  description: 'd',
  settings: { enabledPlugins: Object.fromEntries(ids.map((id) => [id, true])) },
});

const FILE = '/profiles/a/profile.json';
const target = (manifest: ProfileManifest): PluginCheckTarget => ({
  manifest,
  manifestFile: FILE,
});

const SYNCED_CLAUSE =
  'a synced plugin is not listed when the profile leaves out the user source';

describe('judgePluginList', () => {
  test('passes a list with no errorDetails', () => {
    const out = JSON.stringify([
      entry('sidekick@rikmorn'),
      entry('superpowers@claude-plugins-official'),
    ]);
    expect(judgePluginList(out, target(bare))).toEqual({
      ok: true,
      warnings: [],
    });
  });

  test('passes errorDetails null and empty', () => {
    const out = JSON.stringify([entry('a@m', null), entry('b@m', [])]);
    expect(judgePluginList(out, target(bare))).toEqual({
      ok: true,
      warnings: [],
    });
  });

  test('refuses once for the same unmet dependency on two entries of one plugin', () => {
    const out = JSON.stringify([
      entry('sidekick@rikmorn', [unsatisfied]),
      entry('sidekick@rikmorn', [unsatisfied]),
    ]);
    const issues = issuesOf(judgePluginList(out, target(bare)));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('sidekick@rikmorn');
    expect(issues[0]).toContain('superpowers@claude-plugins-official');
    expect(issues[0]).toContain('enabledPlugins');
  });

  test('refuses separately for two different dependencies', () => {
    const other = { ...unsatisfied, dependency: 'other@m' };
    const out = JSON.stringify([
      entry('sidekick@rikmorn', [unsatisfied, other]),
    ]);
    expect(issuesOf(judgePluginList(out, target(bare)))).toHaveLength(2);
  });

  test('refuses although the entry is disabled', () => {
    const out = JSON.stringify([
      { ...entry('sidekick@rikmorn', [unsatisfied]), enabled: false },
    ]);
    expect(issuesOf(judgePluginList(out, target(bare)))).toHaveLength(1);
  });

  test('refuses an unknown id, naming it', () => {
    const out = JSON.stringify([entry('sidekick@rikmorn')]);
    const issues = issuesOf(
      judgePluginList(out, target(naming('sidekik@rikmorn'))),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"sidekik@rikmorn"');
    expect(issues[0]).toContain("this profile's settings");
    expect(issues[0]).not.toContain('installed');
  });

  test('an unknown id names the profile file and both fixes', () => {
    const out = JSON.stringify([entry('sidekick@rikmorn')]);
    const [issue] = issuesOf(
      judgePluginList(out, target(naming('gone@nowhere'))),
    );
    expect(issue).toContain('"gone@nowhere"');
    expect(issue).toContain(FILE);
    expect(issue).toContain('removed that plugin on purpose');
    expect(issue).toContain('misspelled');
    expect(issue).not.toContain('installed');
  });

  test('an unmet dependency names the profile file', () => {
    const out = JSON.stringify([entry('sidekick@rikmorn', [unsatisfied])]);
    const [issue] = issuesOf(judgePluginList(out, target(bare)));
    expect(issue).toContain(FILE);
    expect(issue).toContain('settings.enabledPlugins');
  });

  test('the synced clause comes before the fixes', () => {
    const out = JSON.stringify([entry('sidekick@rikmorn')]);
    const manifest: ProfileManifest = {
      ...naming('sidekik@rikmorn'),
      settingSources: ['project', 'local'],
    };
    const [issue] = issuesOf(judgePluginList(out, target(manifest)));
    expect(issue.indexOf(SYNCED_CLAUSE)).toBeGreaterThan(-1);
    expect(issue.indexOf(SYNCED_CLAUSE)).toBeLessThan(issue.indexOf(FILE));
  });

  test('names the synced case only when the profile leaves out the user source', () => {
    const out = JSON.stringify([entry('sidekick@rikmorn')]);
    const refusal = (settingSources?: SettingSource[]): string =>
      issuesOf(
        judgePluginList(
          out,
          target({ ...naming('sidekik@rikmorn'), settingSources }),
        ),
      ).join('\n');
    expect(refusal(['project', 'local'])).toContain(SYNCED_CLAUSE);
    expect(refusal(['user', 'project'])).not.toContain(SYNCED_CLAUSE);
    expect(refusal()).not.toContain(SYNCED_CLAUSE);
  });

  test('accepts a named id that is listed', () => {
    const out = JSON.stringify([entry('sidekick@rikmorn')]);
    expect(judgePluginList(out, target(naming('sidekick@rikmorn')))).toEqual({
      ok: true,
      warnings: [],
    });
  });

  test('exempts @builtin and @inline ids', () => {
    const out = JSON.stringify([entry('sidekick@rikmorn')]);
    expect(
      judgePluginList(out, target(naming('x@builtin', 'sidekick@inline'))),
    ).toEqual({
      ok: true,
      warnings: [],
    });
  });

  test('warns on another detail type and passes', () => {
    const out = JSON.stringify([
      entry('a@m', [{ type: 'mcp-server-error', message: 'x' }]),
    ]);
    const r = judgePluginList(out, target(bare));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain('a@m');
      expect(r.warnings[0]).toContain('mcp-server-error');
    }
  });

  test('warns once for the same detail on two entries of one plugin', () => {
    const detail = { type: 'mcp-server-error', message: 'x' };
    const out = JSON.stringify([
      entry('a@m', [detail]),
      entry('a@m', [detail]),
    ]);
    expect(judgePluginList(out, target(bare))).toEqual({
      ok: true,
      warnings: ['a@m: claude plugin list reports mcp-server-error.'],
    });
  });

  test('refuses output that is not JSON, naming the skip variable', () => {
    const issues = issuesOf(judgePluginList('not json', target(bare)));
    expect(issues.join('\n')).toContain(PLUGIN_SKIP_VARIABLE);
    expect(issues.join('\n')).toContain('no longer parses');
  });

  test('refuses a JSON object that is not an array', () => {
    expect(issuesOf(judgePluginList('{}', target(bare))).join('\n')).toContain(
      PLUGIN_SKIP_VARIABLE,
    );
  });

  test('refuses an entry without id', () => {
    const out = JSON.stringify([{ scope: 'user' }]);
    expect(issuesOf(judgePluginList(out, target(bare))).join('\n')).toContain(
      PLUGIN_SKIP_VARIABLE,
    );
  });
});

describe('needsPluginCheck', () => {
  test('is false for a manifest with only a description', () => {
    expect(needsPluginCheck({ description: 'd' })).toBe(false);
  });
  test('is true with settingSources', () => {
    expect(needsPluginCheck({ description: 'd', settingSources: [] })).toBe(
      true,
    );
  });
  test('is true with settings.enabledPlugins', () => {
    expect(
      needsPluginCheck({ description: 'd', settings: { enabledPlugins: {} } }),
    ).toBe(true);
  });
  test('is false with only settings.env', () => {
    expect(
      needsPluginCheck({ description: 'd', settings: { env: { A: '1' } } }),
    ).toBe(false);
  });
});

describe('checkPlugins', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-test-'));
    roots.push(d);
    return d;
  };
  const ok = (over: Partial<ClaudeResult> = {}): ClaudeResult => ({
    code: 0,
    stdout: JSON.stringify([entry('sidekick@rikmorn')]),
    stderr: '',
    timedOut: false,
    ...over,
  });
  const harness = (reply: () => ClaudeResult) => {
    const calls: { args: string[]; file: string; mode: number }[] = [];
    const run: ClaudeRunner = (args) => {
      const file = args[args.indexOf('--settings') + 1];
      calls.push({
        args,
        file,
        mode: fs.statSync(file).mode & 0o777,
      });
      return reply();
    };
    const root = tmp();
    const deps = { run, cwd: root, tmpdir: root, skip: false };
    return { calls, deps, root };
  };
  const leftover = (root: string) => fs.readdirSync(root);
  const manifest = { description: 'd' };

  test('runs plugin list with the settings flag before the subcommand', () => {
    const h = harness(() => ok());
    const settings = { enabledPlugins: { 'sidekick@rikmorn': true } };
    expect(
      checkPlugins(settings, target({ description: 'd', settings }), h.deps),
    ).toEqual({
      ok: true,
      warnings: [],
    });
    expect(h.calls[0].args).toEqual([
      '--settings',
      h.calls[0].file,
      'plugin',
      'list',
      '--json',
    ]);
    expect(h.calls[0].mode).toBe(0o600);
  });

  test('writes the settings to the file', () => {
    let content = '';
    const root = tmp();
    const run: ClaudeRunner = (args) => {
      content = fs.readFileSync(args[1], 'utf-8');
      return ok();
    };
    checkPlugins({ env: { A: '1' } }, target(manifest), {
      run,
      cwd: root,
      tmpdir: root,
      skip: false,
    });
    expect(JSON.parse(content)).toEqual({ env: { A: '1' } });
  });

  test('adds the setting sources before the subcommand', () => {
    const h = harness(() => ok());
    checkPlugins(
      {},
      target({ ...manifest, settingSources: ['project', 'local'] }),
      h.deps,
    );
    expect(h.calls[0].args).toEqual([
      '--settings',
      h.calls[0].file,
      '--setting-sources',
      'project,local',
      'plugin',
      'list',
      '--json',
    ]);
  });

  test('refuses an unknown id set true and one set false', () => {
    const h = harness(() => ok());
    const settings = { enabledPlugins: { 'x@m': true, 'y@m': false } };
    const issues = issuesOf(
      checkPlugins(settings, target({ description: 'd', settings }), h.deps),
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('"x@m"');
    expect(issues[1]).toContain('"y@m"');
  });

  test('skips the unknown-id test when enabledPlugins is not an object', () => {
    for (const bad of [[], 'x', null, 3]) {
      const h = harness(() => ok());
      const settings = { enabledPlugins: bad };
      expect(
        checkPlugins(settings, target({ description: 'd', settings }), h.deps),
      ).toEqual({ ok: true, warnings: [] });
    }
  });

  test('removes the temp folder after a pass', () => {
    const h = harness(() => ok());
    checkPlugins({}, target(manifest), h.deps);
    expect(leftover(h.root)).toEqual([]);
  });

  test('removes the temp folder after a refusal', () => {
    const h = harness(() =>
      ok({ stdout: JSON.stringify([entry('s@m', [unsatisfied])]) }),
    );
    expect(checkPlugins({}, target(manifest), h.deps).ok).toBe(false);
    expect(leftover(h.root)).toEqual([]);
  });

  test('refuses on a timeout and removes the folder', () => {
    const h = harness(() => ok({ code: 1, timedOut: true }));
    const r = checkPlugins({}, target(manifest), h.deps);
    expect(issuesOf(r).join('\n')).toContain('timed out');
    expect(leftover(h.root)).toEqual([]);
  });

  test('refuses on a non-zero exit with the output and removes the folder', () => {
    const h = harness(() =>
      ok({ code: 2, stdout: 'out text', stderr: 'err text' }),
    );
    const r = checkPlugins({}, target(manifest), h.deps);
    const text = issuesOf(r).join('\n');
    expect(text).toContain('exit code 2');
    expect(text).toContain('out text');
    expect(text).toContain('err text');
    expect(leftover(h.root)).toEqual([]);
  });

  test('a failed run with no output refuses with its reason alone', () => {
    for (const failed of [
      { code: 1, timedOut: true, reason: 'claude plugin list timed out.' },
      {
        code: 2,
        timedOut: false,
        reason: 'claude plugin list failed with exit code 2.',
      },
    ]) {
      const h = harness(() =>
        ok({ code: failed.code, timedOut: failed.timedOut, stdout: '' }),
      );
      expect(issuesOf(checkPlugins({}, target(manifest), h.deps))).toEqual([
        failed.reason,
      ]);
    }
  });

  test('removes the folder when the runner throws', () => {
    const h = harness(() => {
      throw new Error('boom');
    });
    expect(() => checkPlugins({}, target(manifest), h.deps)).toThrow('boom');
    expect(leftover(h.root)).toEqual([]);
  });

  test('skip runs nothing and warns naming the variable', () => {
    const h = harness(() => ok());
    const r = checkPlugins({}, target(manifest), { ...h.deps, skip: true });
    expect(h.calls).toHaveLength(0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain(PLUGIN_SKIP_VARIABLE);
      expect(r.warnings[0]).toContain('not checked');
    }
  });
});
