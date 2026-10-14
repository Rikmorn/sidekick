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

const SYNCED_CLAUSE =
  'a synced plugin is not listed when the profile leaves out the user source';

describe('judgePluginList', () => {
  test('passes a list with no errorDetails', () => {
    const out = JSON.stringify([
      entry('sidekick@rikmorn'),
      entry('superpowers@claude-plugins-official'),
    ]);
    expect(judgePluginList(out, bare)).toEqual({ ok: true, warnings: [] });
  });

  test('passes errorDetails null and empty', () => {
    const out = JSON.stringify([entry('a@m', null), entry('b@m', [])]);
    expect(judgePluginList(out, bare)).toEqual({ ok: true, warnings: [] });
  });

  test('refuses once for the same unmet dependency on two entries of one plugin', () => {
    const out = JSON.stringify([
      entry('sidekick@rikmorn', [unsatisfied]),
      entry('sidekick@rikmorn', [unsatisfied]),
    ]);
    const issues = issuesOf(judgePluginList(out, bare));
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
    expect(issuesOf(judgePluginList(out, bare))).toHaveLength(2);
  });

  test('refuses although the entry is disabled', () => {
    const out = JSON.stringify([
      { ...entry('sidekick@rikmorn', [unsatisfied]), enabled: false },
    ]);
    expect(issuesOf(judgePluginList(out, bare))).toHaveLength(1);
  });

  test('refuses an unknown id, naming it', () => {
    const out = JSON.stringify([entry('sidekick@rikmorn')]);
    const issues = issuesOf(judgePluginList(out, naming('sidekik@rikmorn')));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"sidekik@rikmorn"');
    expect(issues[0]).toContain("this profile's settings");
    expect(issues[0]).not.toContain('installed');
  });

  test('names the synced case only when the profile leaves out the user source', () => {
    const out = JSON.stringify([entry('sidekick@rikmorn')]);
    const refusal = (settingSources?: SettingSource[]): string =>
      issuesOf(
        judgePluginList(out, { ...naming('sidekik@rikmorn'), settingSources }),
      ).join('\n');
    expect(refusal(['project', 'local'])).toContain(SYNCED_CLAUSE);
    expect(refusal(['user', 'project'])).not.toContain(SYNCED_CLAUSE);
    expect(refusal()).not.toContain(SYNCED_CLAUSE);
  });

  test('accepts a named id that is listed', () => {
    const out = JSON.stringify([entry('sidekick@rikmorn')]);
    expect(judgePluginList(out, naming('sidekick@rikmorn'))).toEqual({
      ok: true,
      warnings: [],
    });
  });

  test('exempts @builtin and @inline ids', () => {
    const out = JSON.stringify([entry('sidekick@rikmorn')]);
    expect(
      judgePluginList(out, naming('x@builtin', 'sidekick@inline')),
    ).toEqual({
      ok: true,
      warnings: [],
    });
  });

  test('warns on another detail type and passes', () => {
    const out = JSON.stringify([
      entry('a@m', [{ type: 'mcp-server-error', message: 'x' }]),
    ]);
    const r = judgePluginList(out, bare);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain('a@m');
      expect(r.warnings[0]).toContain('mcp-server-error');
    }
  });

  test('refuses output that is not JSON, naming the skip variable', () => {
    const issues = issuesOf(judgePluginList('not json', bare));
    expect(issues.join('\n')).toContain(PLUGIN_SKIP_VARIABLE);
    expect(issues.join('\n')).toContain('no longer parses');
  });

  test('refuses a JSON object that is not an array', () => {
    expect(issuesOf(judgePluginList('{}', bare)).join('\n')).toContain(
      PLUGIN_SKIP_VARIABLE,
    );
  });

  test('refuses an entry without id', () => {
    const out = JSON.stringify([{ scope: 'user' }]);
    expect(issuesOf(judgePluginList(out, bare)).join('\n')).toContain(
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
      checkPlugins(settings, { description: 'd', settings }, h.deps),
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
    checkPlugins({ env: { A: '1' } }, manifest, {
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
      { ...manifest, settingSources: ['project', 'local'] },
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
      checkPlugins(settings, { description: 'd', settings }, h.deps),
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
        checkPlugins(settings, { description: 'd', settings }, h.deps),
      ).toEqual({ ok: true, warnings: [] });
    }
  });

  test('removes the temp folder after a pass', () => {
    const h = harness(() => ok());
    checkPlugins({}, manifest, h.deps);
    expect(leftover(h.root)).toEqual([]);
  });

  test('removes the temp folder after a refusal', () => {
    const h = harness(() =>
      ok({ stdout: JSON.stringify([entry('s@m', [unsatisfied])]) }),
    );
    expect(checkPlugins({}, manifest, h.deps).ok).toBe(false);
    expect(leftover(h.root)).toEqual([]);
  });

  test('refuses on a timeout and removes the folder', () => {
    const h = harness(() => ok({ code: 1, timedOut: true }));
    const r = checkPlugins({}, manifest, h.deps);
    expect(issuesOf(r).join('\n')).toContain('timed out');
    expect(leftover(h.root)).toEqual([]);
  });

  test('refuses on a non-zero exit with the output and removes the folder', () => {
    const h = harness(() =>
      ok({ code: 2, stdout: 'out text', stderr: 'err text' }),
    );
    const r = checkPlugins({}, manifest, h.deps);
    const text = issuesOf(r).join('\n');
    expect(text).toContain('exit code 2');
    expect(text).toContain('out text');
    expect(text).toContain('err text');
    expect(leftover(h.root)).toEqual([]);
  });

  test('removes the folder when the runner throws', () => {
    const h = harness(() => {
      throw new Error('boom');
    });
    expect(() => checkPlugins({}, manifest, h.deps)).toThrow('boom');
    expect(leftover(h.root)).toEqual([]);
  });

  test('skip runs nothing and warns naming the variable', () => {
    const h = harness(() => ok());
    const r = checkPlugins({}, manifest, { ...h.deps, skip: true });
    expect(h.calls).toHaveLength(0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain(PLUGIN_SKIP_VARIABLE);
      expect(r.warnings[0]).toContain('not checked');
    }
  });
});
