import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WavePlanError, computeWaves } from './wave-plan.js';
import { parsePlanTasks } from './wave-plan.js';
import { runWavePlanCli } from './wave-plan.js';

const PLAN = `---
slug: demo
pins-rfc: abc123
---

# PLAN — Demo

## Checklist

- [ ] T-01 scaffold provider
- [ ] T-02 register route
- [x] T-03 palette UI

## Tasks

### T-01: Scaffold provider
**Goals:** g1   **Decisions:** D-01
**Deps:**
**Files:**
- Create: \`src/providers/ShortcutProvider.tsx\`
- Test: \`src/providers/ShortcutProvider.test.tsx\`

### T-02: Register route
**Goals:** g2
**Deps:** T-01
**Files:**
- Modify: \`src/routes/index.tsx\` (the loader)

### T-03: Palette UI
**Deps:** T-01
**Files:**
- Create: \`src/components/CommandPalette.tsx\`
`;

describe('parsePlanTasks', () => {
  it('extracts id, num, deps, and normalized files per task block', () => {
    const tasks = parsePlanTasks(PLAN);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toEqual({
      id: 'T-01',
      num: 1,
      deps: [],
      files: [
        'src/providers/ShortcutProvider.tsx',
        'src/providers/ShortcutProvider.test.tsx',
      ],
    });
    expect(tasks[1]).toEqual({
      id: 'T-02',
      num: 2,
      deps: ['T-01'],
      files: ['src/routes/index.tsx'], // trailing "(the loader)" stripped
    });
    expect(tasks[2].deps).toEqual(['T-01']);
  });

  it('returns [] when there is no ## Tasks section', () => {
    expect(parsePlanTasks('# PLAN\n\n## Checklist\n- [ ] T-01 x\n')).toEqual(
      [],
    );
  });
});

const t = (id: string, deps: string[] = [], files: string[] = []) => ({
  id,
  num: Number.parseInt(id.slice(2), 10),
  deps,
  files,
});

describe('computeWaves', () => {
  it('puts independent tasks in one wave', () => {
    const { waves } = computeWaves([t('T-01'), t('T-02'), t('T-03')]);
    expect(waves).toEqual([['T-01', 'T-02', 'T-03']]);
  });

  it('orders a dependency chain into successive waves', () => {
    const { waves } = computeWaves([
      t('T-01'),
      t('T-02', ['T-01']),
      t('T-03', ['T-02']),
    ]);
    expect(waves).toEqual([['T-01'], ['T-02'], ['T-03']]);
  });

  it('uses longest-path levels (diamond)', () => {
    const { waves } = computeWaves([
      t('T-01'),
      t('T-02', ['T-01']),
      t('T-03', ['T-01']),
      t('T-04', ['T-02', 'T-03']),
    ]);
    expect(waves).toEqual([['T-01'], ['T-02', 'T-03'], ['T-04']]);
  });

  it('serializes dependency-independent tasks that share a file', () => {
    const { waves, warnings } = computeWaves([
      t('T-01', [], ['src/a.ts']),
      t('T-02', [], ['src/a.ts', 'src/b.ts']),
    ]);
    expect(waves).toEqual([['T-01'], ['T-02']]);
    expect(
      warnings.some(
        (w) => w.includes('file overlap') || w.includes('share file'),
      ),
    ).toBe(true);
  });

  it('throws on a dependency cycle', () => {
    try {
      computeWaves([t('T-01', ['T-02']), t('T-02', ['T-01'])]);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(WavePlanError);
      expect((e as WavePlanError).kind).toBe('dep_cycle');
    }
  });

  it('throws on a dangling dependency ref', () => {
    try {
      computeWaves([t('T-01', ['T-99'])]);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as WavePlanError).kind).toBe('dangling_dep');
    }
  });
});

describe('runWavePlanCli', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-plan-'));
    fs.mkdirSync(path.join(dir, '.sidekick', 'plans', 'demo'), {
      recursive: true,
    });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const writePlan = (body: string) =>
    fs.writeFileSync(
      path.join(dir, '.sidekick', 'plans', 'demo', 'PLAN.md'),
      body,
    );

  it('returns planned waves as JSON', () => {
    writePlan(
      '# PLAN\n\n## Tasks\n\n### T-01: a\n**Deps:**\n**Files:**\n- Create: `a.ts`\n\n### T-02: b\n**Deps:** T-01\n**Files:**\n- Create: `b.ts`\n',
    );
    const out = JSON.parse(
      runWavePlanCli({ repoRoot: dir, slug: 'demo', format: 'json' }),
    );
    expect(out.verdict).toBe('planned');
    expect(out.waves).toEqual([['T-01'], ['T-02']]);
  });

  it('reports missing_plan', () => {
    const out = JSON.parse(
      runWavePlanCli({ repoRoot: dir, slug: 'nope', format: 'json' }),
    );
    expect(out.verdict).toBe('missing_plan');
  });

  it('reports dep_cycle as a verdict (not a throw)', () => {
    writePlan(
      '# PLAN\n\n## Tasks\n\n### T-01: a\n**Deps:** T-02\n**Files:**\n- Create: `a.ts`\n\n### T-02: b\n**Deps:** T-01\n**Files:**\n- Create: `b.ts`\n',
    );
    const out = JSON.parse(
      runWavePlanCli({ repoRoot: dir, slug: 'demo', format: 'json' }),
    );
    expect(out.verdict).toBe('dep_cycle');
  });
});
