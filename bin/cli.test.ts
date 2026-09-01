import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { install, isMainEntrypoint, uninstall } from './cli.js';

let fakeHome: string | undefined;
let fakePackage: string | undefined;

beforeEach(() => {
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'engineering-cli-home-'));
  fakePackage = fs.mkdtempSync(path.join(os.tmpdir(), 'engineering-cli-pkg-'));
});

afterEach(() => {
  if (fakeHome && fs.existsSync(fakeHome)) {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
  if (fakePackage && fs.existsSync(fakePackage)) {
    fs.rmSync(fakePackage, { recursive: true, force: true });
  }
  fakeHome = undefined;
  fakePackage = undefined;
  mock.restore();
});

function writePackageJson(version = '0.1.0'): void {
  if (!fakePackage) throw new Error('fakePackage not set');
  fs.writeFileSync(
    path.join(fakePackage, 'package.json'),
    JSON.stringify({ name: 'sidekick', version }, null, 2),
  );
}

function writeMinimalDist(): void {
  if (!fakePackage) throw new Error('fakePackage not set');
  fs.mkdirSync(path.join(fakePackage, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(fakePackage, 'dist', 'cli.js'),
    '#!/usr/bin/env node\nconsole.log("ok");\n',
  );
}

// An ESM bundle, like the real one: top-level `import.meta` only evaluates
// when Node loads the file as a module. If an up-tree package.json forces
// CommonJS, Node mis-loads it and the launcher produces nothing — the exact
// failure the co-located package.json fix prevents.
function writeEsmDist(): void {
  if (!fakePackage) throw new Error('fakePackage not set');
  fs.mkdirSync(path.join(fakePackage, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(fakePackage, 'dist', 'cli.js'),
    '#!/usr/bin/env node\nconsole.log(JSON.stringify({ ran: true, url: import.meta.url }));\n',
  );
}

describe('install', () => {
  it('test 1: empty source dirs (with dist) — writes manifest containing only the binary', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();

    install({ packageDir: fakePackage, claudeHome: fakeHome });

    const manifestPath = path.join(fakeHome, 'sidekick', 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.packageVersion).toBe('0.1.0');
    expect(typeof manifest.installedAt).toBe('string');
    // ISO date check (toISOString format)
    expect(() => new Date(manifest.installedAt).toISOString()).not.toThrow();
    // dist/cli.js (bundle) must appear; no other files since managed dirs are absent
    const srcs: string[] = manifest.files.map((e: { src: string }) => e.src);
    expect(srcs).toContain('dist/cli.js');
    const launcherDest = path.join(fakeHome, 'sidekick', 'bin', 'sidekick');
    // launcher is present, executable, and bytes match source bundle
    expect(fs.existsSync(launcherDest)).toBe(true);
    expect(fs.statSync(launcherDest).mode & 0o777).toBe(0o755);
    expect(fs.readFileSync(launcherDest)).toEqual(
      fs.readFileSync(path.join(fakePackage, 'dist', 'cli.js')),
    );
    const dests: string[] = manifest.files.map((e: { dest: string }) => e.dest);
    expect(dests).toContain(launcherDest);
  });

  it('launcher runs as ESM even under an up-tree commonjs package.json', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeEsmDist();
    // A pre-existing, non-sidekick package.json above the install dir that would
    // otherwise make Node load the extension-less ESM launcher as CommonJS.
    // Mirrors the real ~/.claude/package.json {"type":"commonjs"} on the host.
    fs.writeFileSync(
      path.join(fakeHome, 'package.json'),
      JSON.stringify({ type: 'commonjs' }),
    );

    install({ packageDir: fakePackage, claudeHome: fakeHome });

    const launcherDest = path.join(fakeHome, 'sidekick', 'bin', 'sidekick');
    const result = spawnSync('node', [launcherDest], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"ran":true');
  });

  it('writes a type:module package.json beside the launcher', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();

    install({ packageDir: fakePackage, claudeHome: fakeHome });

    const pkgPath = path.join(fakeHome, 'sidekick', 'package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))).toEqual({
      type: 'module',
    });
  });

  it('test 2: copies skills/agents recursively (commands/ is not managed) and records manifest entries', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();

    fs.mkdirSync(path.join(fakePackage, 'skills', 'example'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(fakePackage, 'skills', 'example', 'SKILL.md'),
      'skill body\n',
    );
    fs.mkdirSync(path.join(fakePackage, 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(fakePackage, 'agents', 'default.md'),
      'agent body\n',
    );
    fs.mkdirSync(path.join(fakePackage, 'commands'), { recursive: true });
    fs.writeFileSync(
      path.join(fakePackage, 'commands', 'foo.md'),
      'command body\n',
    );

    install({ packageDir: fakePackage, claudeHome: fakeHome });

    const skillDest = path.join(fakeHome, 'skills', 'example', 'SKILL.md');
    const agentDest = path.join(fakeHome, 'agents', 'default.md');
    expect(fs.readFileSync(skillDest, 'utf-8')).toBe('skill body\n');
    expect(fs.readFileSync(agentDest, 'utf-8')).toBe('agent body\n');
    // commands/ is not a managed dir — it is skipped, not copied.
    expect(fs.existsSync(path.join(fakeHome, 'commands', 'foo.md'))).toBe(
      false,
    );

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fakeHome, 'sidekick', 'manifest.json'),
        'utf-8',
      ),
    );
    // Includes the dist/sidekick binary in addition to the 2 managed-dir files.
    const srcs = manifest.files.map((e: { src: string }) => e.src).sort();
    expect(srcs).toContain('agents/default.md');
    expect(srcs).toContain('skills/example/SKILL.md');
    expect(srcs).not.toContain('commands/foo.md');
    const dests = manifest.files.map((e: { dest: string }) => e.dest);
    expect(dests).toContain(skillDest);
    expect(dests).toContain(agentDest);
  });

  it('test 3: silent overwrite — existing files at dest are replaced without warnings (D-04)', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();

    // Source has NEW content
    fs.mkdirSync(path.join(fakePackage, 'skills', 'example'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(fakePackage, 'skills', 'example', 'SKILL.md'),
      'NEW\n',
    );
    // Destination already has OLD content
    fs.mkdirSync(path.join(fakeHome, 'skills', 'example'), { recursive: true });
    fs.writeFileSync(
      path.join(fakeHome, 'skills', 'example', 'SKILL.md'),
      'OLD\n',
    );

    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    install({ packageDir: fakePackage, claudeHome: fakeHome });

    expect(
      fs.readFileSync(
        path.join(fakeHome, 'skills', 'example', 'SKILL.md'),
        'utf-8',
      ),
    ).toBe('NEW\n');
    // No warnings about overwrite
    expect(warnSpy).not.toHaveBeenCalled();

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fakeHome, 'sidekick', 'manifest.json'),
        'utf-8',
      ),
    );
    const srcs = manifest.files.map((e: { src: string }) => e.src);
    expect(srcs).toContain('skills/example/SKILL.md');
  });

  it('test 7: bootstrap check — package.json missing "name" throws', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    fs.writeFileSync(
      path.join(fakePackage, 'package.json'),
      JSON.stringify({ version: '0.1.0' }, null, 2),
    );

    let err: unknown;
    try {
      install({ packageDir: fakePackage, claudeHome: fakeHome });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toContain(path.join(fakePackage, 'package.json'));
    expect(msg).toMatch(/missing/i);
    expect(msg).toContain('name');
  });

  it('test 8: copies rules/ subtree to <claudeHome>/sidekick/rules/', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();

    fs.mkdirSync(path.join(fakePackage, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(fakePackage, 'rules', 'sk-test.md'), '# rule\n');

    install({ packageDir: fakePackage, claudeHome: fakeHome });

    const rulesDest = path.join(fakeHome, 'sidekick', 'rules', 'sk-test.md');
    expect(fs.existsSync(rulesDest)).toBe(true);
    expect(fs.readFileSync(rulesDest, 'utf-8')).toBe('# rule\n');

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fakeHome, 'sidekick', 'manifest.json'),
        'utf-8',
      ),
    );
    const srcs: string[] = manifest.files.map((e: { src: string }) => e.src);
    expect(srcs).toContain('rules/sk-test.md');
    const ruleEntry = manifest.files.find(
      (e: { src: string }) => e.src === 'rules/sk-test.md',
    );
    expect(ruleEntry?.dest).toBe(rulesDest);
  });

  it('test 10: install ships node bundle to <claudeHome>/sidekick/bin/sidekick and records in manifest', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    fs.mkdirSync(path.join(fakePackage, 'dist'), { recursive: true });
    // Write a fake bundle with distinct bytes to verify byte-for-byte copy
    const fakeBundleBytes = Buffer.from(
      '#!/usr/bin/env node\nconsole.log(42);\n',
    );
    fs.writeFileSync(path.join(fakePackage, 'dist', 'cli.js'), fakeBundleBytes);

    install({ packageDir: fakePackage, claudeHome: fakeHome });

    const launcherDest = path.join(fakeHome, 'sidekick', 'bin', 'sidekick');
    expect(fs.existsSync(launcherDest)).toBe(true);
    // Bytes must match source exactly
    expect(fs.readFileSync(launcherDest)).toEqual(fakeBundleBytes);
    // Must be executable
    expect(fs.statSync(launcherDest).mode & 0o777).toBe(0o755);

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fakeHome, 'sidekick', 'manifest.json'),
        'utf-8',
      ),
    );
    const srcs: string[] = manifest.files.map((e: { src: string }) => e.src);
    expect(srcs).toContain('dist/cli.js');
    const dests: string[] = manifest.files.map((e: { dest: string }) => e.dest);
    expect(dests).toContain(launcherDest);
  });

  it('test 11: install copies bundle to <claudeHome>/sidekick/bin/sidekick with mode 0o755 on re-install', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();

    // First install
    install({ packageDir: fakePackage, claudeHome: fakeHome });

    // Corrupt the mode to verify chmodSync on re-install restores it
    const launcherDest = path.join(fakeHome, 'sidekick', 'bin', 'sidekick');
    fs.chmodSync(launcherDest, 0o600);
    expect(fs.statSync(launcherDest).mode & 0o777).toBe(0o600);

    // Re-install — must restore 0o755
    install({ packageDir: fakePackage, claudeHome: fakeHome });

    expect(fs.existsSync(launcherDest)).toBe(true);
    // chmodSync after copyFileSync ensures mode is correct even on overwrite
    expect(fs.statSync(launcherDest).mode & 0o777).toBe(0o755);

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fakeHome, 'sidekick', 'manifest.json'),
        'utf-8',
      ),
    );
    const srcs: string[] = manifest.files.map((e: { src: string }) => e.src);
    expect(srcs).toContain('dist/cli.js');
    const dests: string[] = manifest.files.map((e: { dest: string }) => e.dest);
    expect(dests).toContain(launcherDest);
  });

  it('test 12: install fails clearly when dist/cli.js bundle is missing from packageDir', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    // No dist/cli.js created — dist/ dir exists but bundle is absent
    fs.mkdirSync(path.join(fakePackage, 'dist'), { recursive: true });

    let err: unknown;
    try {
      install({ packageDir: fakePackage, claudeHome: fakeHome });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    const msg = err instanceof Error ? err.message : String(err);
    expect(msg).toMatch(/dist\/cli\.js/i);
    expect(msg).toMatch(/bun run build/i);
    // No side effects: claudeHome/sidekick must not have been created
    expect(fs.existsSync(path.join(fakeHome, 'sidekick'))).toBe(false);
  });

  it('install round-trips the real package agents/ and skills/ into the manifest', () => {
    if (!fakeHome) throw new Error('fakeHome not set');
    // Resolve the REAL engineering package dir (this test file lives in <pkg>/src/).
    const realPkg = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
    );

    // The precondition guard requires dist/cli.js. In CI the bundle may not
    // exist (it is gitignored). Write a stub and clean up after the test.
    const realBundle = path.join(realPkg, 'dist', 'cli.js');
    const stubWasCreated = !fs.existsSync(realBundle);
    if (stubWasCreated) {
      fs.mkdirSync(path.join(realPkg, 'dist'), { recursive: true });
      fs.writeFileSync(realBundle, '#!/usr/bin/env node\n// stub\n');
    }
    try {
      install({ packageDir: realPkg, claudeHome: fakeHome });
    } finally {
      if (stubWasCreated) {
        fs.rmSync(realBundle, { force: true });
      }
    }

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fakeHome, 'sidekick', 'manifest.json'),
        'utf-8',
      ),
    );
    const dests: string[] = manifest.files.map((f: { dest: string }) => f.dest);

    // Every file under the real agents/ and skills/ trees must round-trip into
    // the manifest. This auto-covers the M2 deliverables (sk-correctness-reviewer,
    // sk-fixer, sk-review/, sk-regen-plan/) once P3–P5 create them — no edit
    // needed. The real M2 install round-trip is also exercised in Task 13.
    for (const sub of ['agents', 'skills'] as const) {
      const srcRoot = path.join(realPkg, sub);
      const expectedFiles: string[] = [];
      const collect = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) collect(full);
          else if (entry.isFile()) expectedFiles.push(full);
        }
      };
      collect(srcRoot);
      expect(expectedFiles.length).toBeGreaterThan(0);
      for (const src of expectedFiles) {
        const rel = path.relative(srcRoot, src);
        expect(dests).toContain(path.join(fakeHome, sub, rel));
      }
    }

    // Named anchors: known M1 deliverables present.
    expect(
      dests.some((d) =>
        d.endsWith(path.join('agents', 'sk-coherence-checker.md')),
      ),
    ).toBe(true);
    expect(
      dests.some((d) =>
        d.endsWith(path.join('skills', 'sk-design', 'SKILL.md')),
      ),
    ).toBe(true);

    // M3 anchor: sk-architecture-reviewer.md is under agents/ and deploys via install.
    expect(
      dests.some((d) =>
        d.endsWith(path.join('agents', 'sk-architecture-reviewer.md')),
      ),
    ).toBe(true);
  });

  it('re-install prunes files the package no longer ships (manifest-scoped)', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();
    fs.mkdirSync(path.join(fakePackage, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(fakePackage, 'agents', 'sk-kept.md'), 'kept');
    fs.writeFileSync(
      path.join(fakePackage, 'agents', 'sk-retired.md'),
      'retired',
    );

    install({ packageDir: fakePackage, claudeHome: fakeHome });
    const retiredDest = path.join(fakeHome, 'agents', 'sk-retired.md');
    expect(fs.existsSync(retiredDest)).toBe(true);

    // The next package version retires the agent.
    fs.rmSync(path.join(fakePackage, 'agents', 'sk-retired.md'));
    install({ packageDir: fakePackage, claudeHome: fakeHome });

    expect(fs.existsSync(retiredDest)).toBe(false);
    expect(fs.existsSync(path.join(fakeHome, 'agents', 'sk-kept.md'))).toBe(
      true,
    );
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fakeHome, 'sidekick', 'manifest.json'),
        'utf-8',
      ),
    );
    const dests: string[] = manifest.files.map((f: { dest: string }) => f.dest);
    expect(dests).not.toContain(retiredDest);
  });

  it('prune never touches files outside the prior manifest (foreign agents survive)', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();
    fs.mkdirSync(path.join(fakePackage, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(fakePackage, 'agents', 'sk-retired.md'), 'x');

    install({ packageDir: fakePackage, claudeHome: fakeHome });

    // A user/other-tool agent that no sidekick manifest ever recorded.
    const foreign = path.join(fakeHome, 'agents', 'my-personal-agent.md');
    fs.writeFileSync(foreign, 'mine');

    fs.rmSync(path.join(fakePackage, 'agents', 'sk-retired.md'));
    install({ packageDir: fakePackage, claudeHome: fakeHome });

    expect(fs.existsSync(foreign)).toBe(true);
    expect(fs.existsSync(path.join(fakeHome, 'agents', 'sk-retired.md'))).toBe(
      false,
    );
  });

  it('re-install prunes a retired skill file and removes its now-empty dir', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();
    fs.mkdirSync(path.join(fakePackage, 'skills', 'sk-old'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(fakePackage, 'skills', 'sk-old', 'SKILL.md'),
      'old',
    );

    install({ packageDir: fakePackage, claudeHome: fakeHome });
    const oldSkillDir = path.join(fakeHome, 'skills', 'sk-old');
    expect(fs.existsSync(path.join(oldSkillDir, 'SKILL.md'))).toBe(true);

    fs.rmSync(path.join(fakePackage, 'skills'), {
      recursive: true,
      force: true,
    });
    install({ packageDir: fakePackage, claudeHome: fakeHome });

    // File pruned AND the empty per-skill dir cleaned up — an empty dir under
    // skills/ would otherwise linger as registry noise.
    expect(fs.existsSync(path.join(oldSkillDir, 'SKILL.md'))).toBe(false);
    expect(fs.existsSync(oldSkillDir)).toBe(false);
    // The managed root itself is never removed.
    expect(fs.existsSync(path.join(fakeHome, 'skills'))).toBe(true);
  });

  it('corrupt prior manifest: install succeeds and skips pruning rather than guessing', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();
    fs.mkdirSync(path.join(fakePackage, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(fakePackage, 'agents', 'sk-kept.md'), 'kept');

    install({ packageDir: fakePackage, claudeHome: fakeHome });
    // Simulate a stray file from an older install whose record is now lost.
    const orphan = path.join(fakeHome, 'agents', 'sk-orphan.md');
    fs.writeFileSync(orphan, 'orphan');
    fs.writeFileSync(
      path.join(fakeHome, 'sidekick', 'manifest.json'),
      'not json{{',
    );

    expect(() =>
      install({ packageDir: fakePackage, claudeHome: fakeHome }),
    ).not.toThrow();
    // Without a trustworthy prior manifest there is no safe prune list.
    expect(fs.existsSync(orphan)).toBe(true);
    // And the new manifest is valid again.
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fakeHome, 'sidekick', 'manifest.json'),
        'utf-8',
      ),
    );
    expect(Array.isArray(manifest.files)).toBe(true);
  });
});

describe('uninstall', () => {
  it('test 4: manifest-driven removal — removes listed files and the state dir (D-05)', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();

    fs.mkdirSync(path.join(fakePackage, 'skills', 'example'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(fakePackage, 'skills', 'example', 'SKILL.md'),
      'skill body\n',
    );
    fs.mkdirSync(path.join(fakePackage, 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(fakePackage, 'agents', 'default.md'),
      'agent body\n',
    );
    install({ packageDir: fakePackage, claudeHome: fakeHome });
    uninstall({ claudeHome: fakeHome });

    expect(
      fs.existsSync(path.join(fakeHome, 'skills', 'example', 'SKILL.md')),
    ).toBe(false);
    expect(fs.existsSync(path.join(fakeHome, 'agents', 'default.md'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(fakeHome, 'sidekick'))).toBe(false);
  });

  it('test 5: missing manifest — emits warning naming the path AND "no manifest", returns successfully (D-05)', () => {
    if (!fakeHome) throw new Error('fakeHome not set');
    const home = fakeHome;
    const expectedPath = path.join(home, 'sidekick', 'manifest.json');
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => uninstall({ claudeHome: home })).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    const allArgs = warnSpy.mock.calls
      .flat()
      .map((a) => String(a))
      .join('\n');
    expect(allArgs).toContain(expectedPath);
    expect(allArgs).toMatch(/no manifest found/i);
  });

  it('test 6: already-gone files are skipped — remaining files still removed (D-05)', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    const pkg = fakePackage;
    const home = fakeHome;
    writePackageJson('0.1.0');
    writeMinimalDist();

    fs.mkdirSync(path.join(pkg, 'skills', 'example'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(pkg, 'skills', 'example', 'SKILL.md'),
      'skill body\n',
    );
    fs.mkdirSync(path.join(pkg, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'agents', 'default.md'), 'agent body\n');
    install({ packageDir: pkg, claudeHome: home });

    // Manually remove one file before uninstall
    fs.rmSync(path.join(home, 'skills', 'example', 'SKILL.md'));

    expect(() => uninstall({ claudeHome: home })).not.toThrow();

    // Remaining files removed; state dir gone
    expect(fs.existsSync(path.join(home, 'agents', 'default.md'))).toBe(false);
    expect(fs.existsSync(path.join(home, 'sidekick'))).toBe(false);
  });

  it('test 9: uninstall removes rules/ files via manifest', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();

    fs.mkdirSync(path.join(fakePackage, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(fakePackage, 'rules', 'sk-test.md'), '# rule\n');

    install({ packageDir: fakePackage, claudeHome: fakeHome });
    uninstall({ claudeHome: fakeHome });

    expect(
      fs.existsSync(path.join(fakeHome, 'sidekick', 'rules', 'sk-test.md')),
    ).toBe(false);
    expect(fs.existsSync(path.join(fakeHome, 'sidekick'))).toBe(false);
  });

  it('test 13: uninstall removes the binary recorded in manifest', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');
    writeMinimalDist();

    install({ packageDir: fakePackage, claudeHome: fakeHome });

    const binaryDest = path.join(fakeHome, 'sidekick', 'bin', 'sidekick');
    // Confirm it exists after install
    expect(fs.existsSync(binaryDest)).toBe(true);

    uninstall({ claudeHome: fakeHome });

    // Binary removed; state dir gone
    expect(fs.existsSync(binaryDest)).toBe(false);
    expect(fs.existsSync(path.join(fakeHome, 'sidekick'))).toBe(false);
  });
});

describe('isMainEntrypoint', () => {
  let tmpDir: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isMainEntrypoint-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    tmpDir = undefined;
  });

  it('returns true when argv1 is a symlink pointing to the same real file as importMetaUrl', () => {
    if (!tmpDir) throw new Error('tmpDir not set');
    const realFile = path.join(tmpDir, 'real.js');
    const symlinkPath = path.join(tmpDir, 'link.js');
    fs.writeFileSync(realFile, '// real\n');
    fs.symlinkSync(realFile, symlinkPath);

    expect(isMainEntrypoint(pathToFileURL(realFile).href, symlinkPath)).toBe(
      true,
    );
  });

  it('returns false for two different existing files', () => {
    if (!tmpDir) throw new Error('tmpDir not set');
    const fileA = path.join(tmpDir, 'a.js');
    const fileB = path.join(tmpDir, 'b.js');
    fs.writeFileSync(fileA, '// a\n');
    fs.writeFileSync(fileB, '// b\n');

    expect(isMainEntrypoint(pathToFileURL(fileA).href, fileB)).toBe(false);
  });

  it('returns false when argv1 is undefined', () => {
    expect(isMainEntrypoint(import.meta.url, undefined)).toBe(false);
  });
});

describe('hook subcommand', () => {
  const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));

  it('denies an Edit to .sidekick/config.json (stdout JSON, exit 0)', () => {
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: '/repo/.sidekick/config.json' },
    });
    const res = spawnSync('bun', [cli, 'hook', 'guard-config'], {
      input,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('emits nothing for an unrelated file (no auto-allow)', () => {
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: '/repo/src/index.ts' },
    });
    const res = spawnSync('bun', [cli, 'hook', 'guard-config'], {
      input,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('');
  });
});
