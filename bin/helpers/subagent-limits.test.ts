import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readSection } from './hook.js';
import {
  BRIEF_LIMITS_HEADING,
  readBriefLimits,
  subagentLimitsContext,
  WORKER_LIMITS_HEADING,
} from './subagent-limits.js';

let dir: string;
let pluginDir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-sublimits-'));
  pluginDir = path.join(dir, 'plugin');
  fs.mkdirSync(path.join(pluginDir, 'skills', 'sk-worker'), {
    recursive: true,
  });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function brief(body: string, name = 'brief.md'): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return file;
}

function skill(body: string): void {
  fs.writeFileSync(
    path.join(pluginDir, 'skills', 'sk-worker', 'SKILL.md'),
    body,
  );
}

const SKILL_BODY =
  '# sk-worker\n\n## Limits this skill adds\n- Own limit.\n\n## Other\nx\n';

function context(
  env: Record<string, string | undefined>,
  budget?: number,
): string | undefined {
  return subagentLimitsContext({ env, pluginDir, readSection, budget });
}

describe('subagentLimitsContext', () => {
  test('composes the lead, the brief section, then the skill section', () => {
    const file = brief(
      '# Brief\n\n## Limits\n- Write only in the worktree.\n\n## Task\ndo it\n',
    );
    skill(SKILL_BODY);
    const text = context({ SIDEKICK_WORKER: file });
    expect(text).toBeDefined();
    const lead =
      text?.indexOf('you are a subagent of a dispatched worker') ?? -1;
    const brief1 =
      text?.indexOf('## Limits\n- Write only in the worktree.') ?? -1;
    const own = text?.indexOf('## Limits this skill adds\n- Own limit.') ?? -1;
    expect(lead).toBeGreaterThanOrEqual(0);
    expect(brief1).toBeGreaterThan(lead);
    expect(own).toBeGreaterThan(brief1);
    expect(text).not.toContain('## Task');
    expect(text).not.toContain('## Other');
  });

  test('yields nothing when SIDEKICK_WORKER is unset or empty', () => {
    skill(SKILL_BODY);
    expect(context({})).toBeUndefined();
    expect(context({ SIDEKICK_WORKER: '' })).toBeUndefined();
  });

  test('yields nothing when the brief file is missing', () => {
    expect(
      context({ SIDEKICK_WORKER: path.join(dir, 'gone.md') }),
    ).toBeUndefined();
  });

  test('yields nothing when the brief has no limits, or only blank lines under them', () => {
    const none = brief('# Brief\n\n## Task\ndo it\n', 'none.md');
    const blank = brief(
      '# Brief\n\n## Limits\n\n   \n\n## Task\ndo it\n',
      'blank.md',
    );
    expect(context({ SIDEKICK_WORKER: none })).toBeUndefined();
    expect(context({ SIDEKICK_WORKER: blank })).toBeUndefined();
    expect(readBriefLimits(none, readSection)).toBeUndefined();
    expect(readBriefLimits(blank, readSection)).toBeUndefined();
  });

  test('keeps the lead and the brief section when the plugin has no sk-worker section', () => {
    const file = brief('## Limits\n- Stay put.\n');
    const text = context({ SIDEKICK_WORKER: file });
    expect(text).toContain('you are a subagent of a dispatched worker');
    expect(text).toContain('- Stay put.');
    expect(text).not.toContain(WORKER_LIMITS_HEADING);
  });

  test('a fenced `## ` line does not end the section', () => {
    const file = brief(
      '## Limits\n- One.\n```\n## not a heading\n```\n- After the fence.\n\n## Task\nx\n',
    );
    const text = context({ SIDEKICK_WORKER: file });
    expect(text).toContain('## not a heading');
    expect(text).toContain('- After the fence.');
    expect(text).not.toContain('## Task');
  });

  test('reads a brief with CRLF line endings', () => {
    const file = brief(
      '# Brief\r\n\r\n## Limits\r\n- Crlf limit.\r\n\r\n## Task\r\nx\r\n',
    );
    expect(context({ SIDEKICK_WORKER: file })).toContain('- Crlf limit.');
  });

  test('sends a pointer when the composed text exceeds the budget', () => {
    const file = brief('## Limits\n- Secret body line.\n');
    skill(SKILL_BODY);
    const text = context({ SIDEKICK_WORKER: file }, 10);
    expect(text).toBeDefined();
    expect(text).toContain(file);
    expect(text).toContain(BRIEF_LIMITS_HEADING);
    expect(text).toContain(WORKER_LIMITS_HEADING);
    expect(text).toContain(
      path.join(pluginDir, 'skills', 'sk-worker', 'SKILL.md'),
    );
    expect(text).not.toContain('Secret body line');
    expect(text).not.toContain('Own limit');
  });

  test('stays silent when the reader throws', () => {
    const file = brief('## Limits\n- x\n');
    const text = subagentLimitsContext({
      env: { SIDEKICK_WORKER: file },
      pluginDir,
      readSection: () => {
        throw new Error('boom');
      },
    });
    expect(text).toBeUndefined();
  });
});
