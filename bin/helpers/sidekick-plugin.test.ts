import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isSidekickPlugin,
  SIDEKICK_DEPENDENCY_IDS,
  SIDEKICK_ID,
} from './sidekick-plugin.js';

const repo = path.resolve(import.meta.dir, '..', '..');
const readJson = (...parts: string[]): unknown =>
  JSON.parse(fs.readFileSync(path.join(repo, ...parts), 'utf8'));

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-plugin-'));
  temps.push(dir);
  return dir;
};

describe('the ids', () => {
  const plugin = readJson('plugin', '.claude-plugin', 'plugin.json') as {
    name: string;
    dependencies: { name: string; marketplace: string }[];
  };
  const market = readJson('.claude-plugin', 'marketplace.json') as {
    name: string;
  };

  test('SIDEKICK_ID is the plugin name at the marketplace name', () => {
    expect(SIDEKICK_ID).toBe(`${plugin.name}@${market.name}`);
  });

  test('SIDEKICK_DEPENDENCY_IDS name each dependency at its marketplace', () => {
    expect(SIDEKICK_DEPENDENCY_IDS).toEqual(
      plugin.dependencies.map((d) => `${d.name}@${d.marketplace}`),
    );
    expect(SIDEKICK_DEPENDENCY_IDS.length).toBeGreaterThan(0);
  });
});

describe('isSidekickPlugin', () => {
  test("is true for this repo's plugin folder", () => {
    expect(isSidekickPlugin(path.join(repo, 'plugin'))).toBe(true);
  });

  test('is false for an empty folder and a missing one', () => {
    const dir = tempDir();
    expect(isSidekickPlugin(dir)).toBe(false);
    expect(isSidekickPlugin(path.join(dir, 'nowhere'))).toBe(false);
  });

  test('is false for another plugin, and for an invalid manifest', () => {
    const other = tempDir();
    fs.mkdirSync(path.join(other, '.claude-plugin'));
    fs.writeFileSync(
      path.join(other, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'not-sidekick' }),
    );
    expect(isSidekickPlugin(other)).toBe(false);
    fs.writeFileSync(path.join(other, '.claude-plugin', 'plugin.json'), '{');
    expect(isSidekickPlugin(other)).toBe(false);
  });
});
