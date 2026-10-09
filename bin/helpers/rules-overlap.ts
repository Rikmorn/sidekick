import * as fs from 'node:fs';
import * as path from 'node:path';
import { isOwnedRule, isRegularFile, ownedRulesIn } from './rules-fs.js';

export type OverlapSignal = 'name' | { headings: number } | { opening: string };
export interface OverlapPair {
  file: string;
  rule: string;
  signals: OverlapSignal[];
}
export interface StatedExtension {
  file: string;
  rule: string;
}
export interface OverlapReport {
  pairs: OverlapPair[];
  extensions: StatedExtension[];
}

interface ShippedRule {
  name: string;
  headings: Set<string>;
  opening: string | undefined;
}

// A single shared heading ("Structure", "Naming") was the measured false positive.
const MIN_SHARED_HEADINGS = 2;

const normalise = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[.:;!?]+$/, '')
    .trim();

function headingsOf(body: string): string[] {
  return body
    .split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => normalise(l.slice(3)));
}

function openingOf(body: string): string | undefined {
  let lines = body.split('\n');
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    lines = end === -1 ? [] : lines.slice(end + 1);
  }
  const first = lines.find((l) => l.trim() !== '' && !l.startsWith('#'));
  if (!first) return undefined;
  const sentence = first.split(/\.\s|\.$/)[0];
  const value = normalise(sentence);
  return value === '' ? undefined : value;
}

function signalsFor(
  file: string,
  body: string,
  rule: ShippedRule,
): OverlapSignal[] {
  const signals: OverlapSignal[] = [];
  if (file === rule.name.slice('sk-'.length)) signals.push('name');
  const shared = new Set(headingsOf(body).filter((h) => rule.headings.has(h)))
    .size;
  if (shared >= MIN_SHARED_HEADINGS) signals.push({ headings: shared });
  const opening = openingOf(body);
  if (opening !== undefined && opening === rule.opening) {
    signals.push({ opening });
  }
  return signals;
}

export function findOverlap(src: string, dest: string): OverlapReport {
  const report: OverlapReport = { pairs: [], extensions: [] };
  const destStat = fs.statSync(dest, { throwIfNoEntry: false });
  if (!destStat?.isDirectory()) return report;
  const rules: ShippedRule[] = ownedRulesIn(src).map((name) => {
    const body = fs.readFileSync(path.join(src, name), 'utf-8');
    return {
      name,
      headings: new Set(headingsOf(body)),
      opening: openingOf(body),
    };
  });
  const others = fs
    .readdirSync(dest)
    .filter(
      (n) => n.endsWith('.md') && !isOwnedRule(n) && isRegularFile(dest, n),
    )
    .sort();
  for (const file of others) {
    const body = fs.readFileSync(path.join(dest, file), 'utf-8');
    for (const rule of rules) {
      const signals = signalsFor(file, body, rule);
      if (signals.length === 0) continue;
      if (body.includes(rule.name)) {
        report.extensions.push({ file, rule: rule.name });
      } else {
        report.pairs.push({ file, rule: rule.name, signals });
      }
    }
  }
  return report;
}

function describeSignal(signal: OverlapSignal): string {
  if (signal === 'name') return 'name';
  if ('headings' in signal) return `${signal.headings} headings`;
  return 'opening';
}

export function formatOverlap(report: OverlapReport): string[] {
  const lines: string[] = [];
  if (report.pairs.length === 0) {
    lines.push(
      'no overlap found (checked file names, two or more shared H2 headings, and the opening sentence against non-sk-*.md files)',
    );
  } else {
    for (const p of report.pairs) {
      lines.push(
        `${p.file} overlaps ${p.rule} on ${p.signals.map(describeSignal).join(', ')}`,
      );
    }
    lines.push(
      'overlap is reported only; sidekick never edits files it does not own. If a repo file extends or departs from its pair on purpose, name the sk rule in it and the pair moves to the stated extensions',
    );
  }
  if (report.extensions.length > 0) {
    lines.push(
      `stated extensions, not reported: ${report.extensions.map((e) => `${e.file} → ${e.rule}`).join(', ')}`,
    );
  }
  return lines;
}
