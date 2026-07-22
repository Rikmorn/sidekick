import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../cli.js';
import { GRAPH_SUBCOMMANDS, positionals, runGraphCli } from './graph-cli.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

describe('graph CLI surface', () => {
  it('declares the whole subcommand family', () => {
    expect([...GRAPH_SUBCOMMANDS]).toEqual([
      'build',
      'query',
      'coverage',
      'gaps',
      'applies',
      'diff',
      'lint',
      'state',
      'map',
    ]);
  });

  it('fails with usage on an unknown or missing subcommand', async () => {
    for (const argv of [[], ['nonsense']]) {
      const res = await runGraphCli({ repoRoot: REPO_ROOT, argv });
      expect(res.exitCode).toBe(1);
      expect(res.stdout).toContain('Usage: sidekick graph');
    }
  });

  it('separates positionals from value-taking flags', () => {
    expect(positionals(['ops-2', '--json'])).toEqual(['ops-2']);
    expect(positionals(['ops-2', '--budget', '2000'])).toEqual(['ops-2']);
    expect(positionals(['--db', 'x.db', 'a', 'b'])).toEqual(['a', 'b']);
  });
});

/**
 * The graph helpers are repo-internal — the deliberate productization seam.
 * Two independent guards, because either one alone leaks: the install manifest
 * decides what a consumer receives as files, and the static import graph
 * decides what the shipped bundle carries as code.
 */
describe('graph helpers stay out of a consumer install', () => {
  let fakeHome: string;
  let fakePackage: string;

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-graph-home-'));
    fakePackage = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-graph-pkg-'));
    fs.writeFileSync(
      path.join(fakePackage, 'package.json'),
      JSON.stringify({ name: 'sidekick', version: '0.1.0' }),
    );
    fs.mkdirSync(path.join(fakePackage, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(fakePackage, 'dist', 'cli.js'),
      '#!/usr/bin/env node\n',
    );
    fs.mkdirSync(path.join(fakePackage, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(fakePackage, 'agents', 'sk-fixer.md'), 'x');
    fs.mkdirSync(path.join(fakePackage, 'bin', 'helpers'), { recursive: true });
    for (const name of ['graph-build.ts', 'graph-store.ts', 'graph-cli.ts']) {
      fs.writeFileSync(path.join(fakePackage, 'bin', 'helpers', name), 'x');
    }
  });

  afterEach(() => {
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(fakePackage, { recursive: true, force: true });
  });

  it('records no graph helper in the install manifest', () => {
    install({ packageDir: fakePackage, claudeHome: fakeHome });
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fakeHome, 'sidekick', 'manifest.json'),
        'utf-8',
      ),
    );
    const srcs: string[] = manifest.files.map((f: { src: string }) => f.src);
    expect(srcs.some((s) => s.includes('graph-'))).toBe(false);
    expect(srcs.some((s) => s.startsWith('bin/'))).toBe(false);
    expect(srcs).toContain('agents/sk-fixer.md');
  });

  it('copies no graph helper into the claude home', () => {
    install({ packageDir: fakePackage, claudeHome: fakeHome });
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else found.push(e.name);
      }
    };
    walk(fakeHome);
    expect(found.filter((name) => name.startsWith('graph-'))).toEqual([]);
    expect(found).toContain('sk-fixer.md');
  });

  it('is reachable from bin/cli.ts only through a runtime specifier', () => {
    // A static `import ... from './helpers/graph-*.js'` would inline the graph
    // code — and its `bun:sqlite` dependency — into the Node bundle.
    const cli = fs.readFileSync(path.join(REPO_ROOT, 'bin', 'cli.ts'), 'utf-8');
    expect(/^import[^\n]*graph-/m.test(cli)).toBe(false);
    expect(cli).toContain("new URL('./helpers/graph-cli.js', import.meta.url)");
  });
});
