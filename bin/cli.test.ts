import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  vi.restoreAllMocks();
});

function writePackageJson(version = '0.1.0'): void {
  if (!fakePackage) throw new Error('fakePackage not set');
  fs.writeFileSync(
    path.join(fakePackage, 'package.json'),
    JSON.stringify({ name: 'sidekick', version }, null, 2),
  );
}

describe('install', () => {
  it('test 1: empty source dirs — writes manifest with empty files array', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');

    install({ packageDir: fakePackage, claudeHome: fakeHome });

    const manifestPath = path.join(fakeHome, 'sidekick', 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.packageVersion).toBe('0.1.0');
    expect(typeof manifest.installedAt).toBe('string');
    // ISO date check (toISOString format)
    expect(() => new Date(manifest.installedAt).toISOString()).not.toThrow();
    expect(manifest.files).toEqual([]);
  });

  it('test 2: copies skills/agents/commands recursively and records manifest entries', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');

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
    const commandDest = path.join(fakeHome, 'commands', 'foo.md');
    expect(fs.readFileSync(skillDest, 'utf-8')).toBe('skill body\n');
    expect(fs.readFileSync(agentDest, 'utf-8')).toBe('agent body\n');
    expect(fs.readFileSync(commandDest, 'utf-8')).toBe('command body\n');

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fakeHome, 'sidekick', 'manifest.json'),
        'utf-8',
      ),
    );
    expect(manifest.files).toHaveLength(3);
    const srcs = manifest.files.map((e: { src: string }) => e.src).sort();
    expect(srcs).toEqual([
      'agents/default.md',
      'commands/foo.md',
      'skills/example/SKILL.md',
    ]);
    const dests = manifest.files.map((e: { dest: string }) => e.dest);
    expect(dests).toContain(skillDest);
    expect(dests).toContain(agentDest);
    expect(dests).toContain(commandDest);
  });

  it('test 3: silent overwrite — existing files at dest are replaced without warnings (D-04)', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');

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

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0].src).toBe('rules/sk-test.md');
    expect(manifest.files[0].dest).toBe(rulesDest);
  });

  it('install round-trips the real package agents/ and skills/ into the manifest', () => {
    if (!fakeHome) throw new Error('fakeHome not set');
    // Resolve the REAL engineering package dir (this test file lives in <pkg>/src/).
    const realPkg = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
    );

    install({ packageDir: realPkg, claudeHome: fakeHome });

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
        d.endsWith(path.join('agents', 'sk-structural-checker.md')),
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
});

describe('uninstall', () => {
  it('test 4: manifest-driven removal — removes listed files and the state dir (D-05)', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');

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
    uninstall({ claudeHome: fakeHome });

    expect(
      fs.existsSync(path.join(fakeHome, 'skills', 'example', 'SKILL.md')),
    ).toBe(false);
    expect(fs.existsSync(path.join(fakeHome, 'agents', 'default.md'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(fakeHome, 'commands', 'foo.md'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(fakeHome, 'sidekick'))).toBe(false);
  });

  it('test 5: missing manifest — emits warning naming the path AND "no manifest", returns successfully (D-05)', () => {
    if (!fakeHome) throw new Error('fakeHome not set');
    const home = fakeHome;
    const expectedPath = path.join(home, 'sidekick', 'manifest.json');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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

    fs.mkdirSync(path.join(pkg, 'skills', 'example'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(pkg, 'skills', 'example', 'SKILL.md'),
      'skill body\n',
    );
    fs.mkdirSync(path.join(pkg, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'agents', 'default.md'), 'agent body\n');
    fs.mkdirSync(path.join(pkg, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'commands', 'foo.md'), 'command body\n');

    install({ packageDir: pkg, claudeHome: home });

    // Manually remove one file before uninstall
    fs.rmSync(path.join(home, 'skills', 'example', 'SKILL.md'));

    expect(() => uninstall({ claudeHome: home })).not.toThrow();

    // Remaining files removed; state dir gone
    expect(fs.existsSync(path.join(home, 'agents', 'default.md'))).toBe(false);
    expect(fs.existsSync(path.join(home, 'commands', 'foo.md'))).toBe(false);
    expect(fs.existsSync(path.join(home, 'sidekick'))).toBe(false);
  });

  it('test 9: uninstall removes rules/ files via manifest', () => {
    if (!fakePackage || !fakeHome) throw new Error('fixtures not set');
    writePackageJson('0.1.0');

    fs.mkdirSync(path.join(fakePackage, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(fakePackage, 'rules', 'sk-test.md'), '# rule\n');

    install({ packageDir: fakePackage, claudeHome: fakeHome });
    uninstall({ claudeHome: fakeHome });

    expect(
      fs.existsSync(path.join(fakeHome, 'sidekick', 'rules', 'sk-test.md')),
    ).toBe(false);
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
