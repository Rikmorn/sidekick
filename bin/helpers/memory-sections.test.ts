import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readSection } from './hook.js';
import {
  headingAs,
  isHeading,
  NEXT_HEADING,
  otherHeadings,
  STATE_HEADING,
} from './memory-sections.js';
import {
  fitWorkstream,
  renderStart,
  type StartParts,
} from './memory-start-render.js';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sections-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(text: string): string {
  const file = path.join(dir, 'alpha.md');
  fs.writeFileSync(file, text);
  return file;
}

describe('section helpers', () => {
  test('headings match case-insensitively and ignore trailing space', () => {
    expect(isHeading('## state  ', STATE_HEADING)).toBe(true);
    expect(isHeading('## States', STATE_HEADING)).toBe(false);
  });

  test('headingAs returns the file spelling, else the given heading', () => {
    const file = write('---\nname: a\n---\n## NEXT STEPS\nx\n');
    expect(headingAs(file, NEXT_HEADING)).toBe('## NEXT STEPS');
    expect(headingAs(file, STATE_HEADING)).toBe(STATE_HEADING);
  });

  test('otherHeadings skips the two printed sections and fenced headings', () => {
    const file = write(
      '---\nname: a\n---\n## State\na\n## Key files\n```\n## Fake\n```\n## Next steps\nb\n## Context\n',
    );
    expect(otherHeadings(file)).toEqual(['## Key files', '## Context']);
  });
});

describe('fitWorkstream', () => {
  const PATH = '/store/proj/alpha.md';

  test('under budget, nothing is cut', () => {
    const fit = fitWorkstream('## State\nok', '## Next steps\nok', PATH);
    expect(fit.cut).toEqual({ state: false, nextSteps: false });
    expect(fit.state).toBe('## State\nok');
    expect(fit.sizes.nextSteps).toBe('## Next steps\nok'.length);
  });

  test('absent sections stay undefined with size 0', () => {
    const fit = fitWorkstream(undefined, undefined, PATH);
    expect(fit.state).toBeUndefined();
    expect(fit.nextSteps).toBeUndefined();
    expect(fit.sizes.state).toBe(0);
    expect(fit.sizes.nextSteps).toBe(0);
    expect(fit.cut).toEqual({ state: false, nextSteps: false });
  });

  test('Next steps over its budget is cut with the marker', () => {
    const next = `## Next steps\n${'line of text\n'.repeat(400)}`;
    const fit = fitWorkstream('## State\nok', next, PATH);
    expect(fit.cut.nextSteps).toBe(true);
    expect(fit.cut.state).toBe(false);
    expect(fit.nextSteps).toContain(`… (cut; Read ${PATH})`);
    expect(fit.nextSteps?.length).toBeLessThanOrEqual(fit.sizes.nextBudget);
  });

  test('State over what Next steps leaves is cut', () => {
    const next = `## Next steps\n${'n\n'.repeat(1200)}`;
    const state = `## State\n${'line of text\n'.repeat(300)}`;
    const fit = fitWorkstream(state, next, PATH);
    expect(fit.cut.state).toBe(true);
    expect(fit.sizes.state).toBe(state.length);
    expect(fit.state?.length).toBeLessThanOrEqual(fit.sizes.stateBudget);
    expect(fit.sizes.stateBudget + (fit.nextSteps?.length ?? 0)).toBe(
      fit.sizes.nextBudget + 2000,
    );
  });
});

describe('fitWorkstream agrees with renderStart on real section reads', () => {
  function startParts(
    file: string,
    state: string | undefined,
    nextSteps: string | undefined,
  ): StartParts {
    return {
      sessionId: 'abc',
      source: 'startup',
      recordPath: '/store/proj/sessions/2026-11-02-abc.md',
      recordExists: false,
      match: {
        kind: 'matched',
        workstream: {
          name: 'alpha',
          description: 'about alpha',
          status: 'open',
          branches: [],
          path: file,
        },
        label: 'branch feat',
        others: [],
      },
      statePath: file,
      state,
      nextSteps,
      otherHeadings: [],
      records: [],
      family: undefined,
      warnings: [],
    };
  }

  // The hook reads sections with readSection, so the inputs come through it.
  function agree(text: string): void {
    const file = write(text);
    const state = readSection(file, STATE_HEADING);
    const nextSteps = readSection(file, NEXT_HEADING);
    const fit = fitWorkstream(state, nextSteps, file);
    const out = renderStart(startParts(file, state, nextSteps));
    const marker = `… (cut; Read ${file})`;
    const stateAt = out.indexOf(STATE_HEADING);
    const nextAt = out.indexOf(NEXT_HEADING);
    expect(stateAt).toBeGreaterThanOrEqual(0);
    expect(nextAt).toBeGreaterThan(stateAt);
    expect(fit.cut.state).toBe(out.slice(stateAt, nextAt).includes(marker));
    expect(fit.cut.nextSteps).toBe(out.slice(nextAt).includes(marker));
  }

  test('CRLF endings, under and over budget', () => {
    for (const n of [10, 600]) {
      const section = (h: string) => `${h}\r\n${'a line\r\n'.repeat(n)}`;
      agree(`${section('## State')}${section('## Next steps')}`);
    }
  });

  test('non-ASCII text, under and over budget', () => {
    for (const n of [10, 400]) {
      const section = (h: string) =>
        `${h}\n${'日本語 🎉 emoji line\n'.repeat(n)}`;
      agree(`${section('## State')}${section('## Next steps')}`);
    }
  });
});
