import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSkillDescription, runHookCli } from './hook.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const PLUGIN_DIR = path.join(REPO_ROOT, 'plugin');
const LIVE_SKILL = path.join(PLUGIN_DIR, 'skills', 'sk-design', 'SKILL.md');
const WRAPPER = path.join(PLUGIN_DIR, 'hooks', 'post-skill');

const LEAD =
  'sidekick: before this brainstorm proposes approaches, check whether the change needs a design pass.';

function event(skill: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Skill',
    tool_input: { skill },
    ...extra,
  });
}

function run(stdin: string, pluginDir = PLUGIN_DIR) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runHookCli(
    ['post-skill'],
    { readStdin: () => stdin, pluginDir },
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
}

function tmpSkill(frontmatter: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-hook-'));
  const file = path.join(dir, 'SKILL.md');
  fs.writeFileSync(file, frontmatter);
  return file;
}

describe('readSkillDescription', () => {
  test('the live sk-design description is one JSON-compatible quoted line', () => {
    const description = readSkillDescription(LIVE_SKILL);
    expect(typeof description).toBe('string');
    const raw = fs.readFileSync(LIVE_SKILL, 'utf-8');
    expect(raw).toContain(`description: ${JSON.stringify(description)}\n`);
  });

  test('undefined for a missing file, no frontmatter, or an unquoted value', () => {
    expect(readSkillDescription(path.join(os.tmpdir(), 'nope.md'))).toBe(
      undefined,
    );
    expect(readSkillDescription(tmpSkill('# no frontmatter\n'))).toBe(
      undefined,
    );
    expect(
      readSkillDescription(tmpSkill('---\nname: x\ndescription: bare\n---\n')),
    ).toBe(undefined);
  });
});

describe('runHookCli post-skill', () => {
  test('brainstorming adds the lead and the live description', () => {
    const { code, out, err } = run(event('superpowers:brainstorming'));
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.length).toBe(1);
    const parsed = JSON.parse(out[0]);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    const context: string = parsed.hookSpecificOutput.additionalContext;
    expect(context.startsWith(LEAD)).toBe(true);
    expect(context).toContain(
      `sidekick:sk-design: ${readSkillDescription(LIVE_SKILL)}`,
    );
  });

  test('extra fields in the event do not stop the nudge', () => {
    const stdin = event('superpowers:brainstorming', {
      session_id: 'abc',
      tool_input: { skill: 'superpowers:brainstorming', args: '#119' },
      tool_response: { success: true },
    });
    expect(run(stdin).out.length).toBe(1);
  });

  test('other skills print nothing and return 0', () => {
    for (const skill of [
      'superpowers:systematic-debugging',
      'sidekick:sk-design',
      'brainstorming',
    ]) {
      expect(run(event(skill))).toEqual({ code: 0, out: [], err: [] });
    }
  });

  test('malformed stdin prints nothing and returns 0', () => {
    for (const stdin of [
      '',
      'not json',
      'null',
      '[]',
      '{"tool_input":{}}',
      '{"tool_input":{"skill":42}}',
    ]) {
      expect(run(stdin)).toEqual({ code: 0, out: [], err: [] });
    }
  });

  test('a plugin dir without sk-design prints nothing and returns 0', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-hook-plugin-'));
    expect(run(event('superpowers:brainstorming'), empty)).toEqual({
      code: 0,
      out: [],
      err: [],
    });
  });

  test('an unknown verb prints usage and returns 1 without reading stdin', () => {
    const err: string[] = [];
    const code = runHookCli(
      ['pre-skill'],
      {
        readStdin: () => {
          throw new Error('stdin read before the verb check');
        },
        pluginDir: PLUGIN_DIR,
      },
      () => {},
      (l) => err.push(l),
    );
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('sidekick hook post-skill');
  });
});

describe('plugin/hooks/post-skill', () => {
  test('passes stdin to the bundled CLI and prints the nudge', () => {
    const r = spawnSync('bash', [WRAPPER], {
      input: event('superpowers:brainstorming'),
      encoding: 'utf-8',
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed.hookSpecificOutput.additionalContext.startsWith(LEAD)).toBe(
      true,
    );
  });

  test('exits 0 silently when node is not on PATH', () => {
    const r = spawnSync('/bin/bash', [WRAPPER], {
      input: event('superpowers:brainstorming'),
      encoding: 'utf-8',
      env: { PATH: '/nonexistent' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });
});
