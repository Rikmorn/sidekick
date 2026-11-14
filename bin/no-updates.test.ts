import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Claude Code shows an update's notice only in the session that ran it, and
// nobody watches the sessions these scripts start (#390).
const scriptsDir = import.meta.dir;
const startsSession = /\bclaude\s+(-p|--print|--bg)\b/;

const scripts = fs
  .readdirSync(scriptsDir)
  .filter((name) => name.endsWith('.sh'))
  .map((name) => ({
    name,
    text: fs.readFileSync(path.join(scriptsDir, name), 'utf-8'),
  }))
  .filter(({ text }) => startsSession.test(text));

describe('repo scripts that start a Claude session', () => {
  test('there is at least one, so the check below checks something', () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  test.each(
    scripts.map(({ name, text }) => [name, text]),
  )('%s turns off updates in the sessions it starts', (_name, text) => {
    expect(text).toContain('DISABLE_AUTOUPDATER');
  });
});
