// The patterns the memory lint and the memory start hook's gate both read, and how both withhold a store name that matches one.
// Injection patterns are copied from get-shit-done-cc 1.42.3, hooks/gsd-read-injection-scanner.js.
// Key patterns are translated from gitleaks at commit 5f6ec56cfa6f8c67648d863582c7ae2f206d5c1c, config/gitleaks.toml.
// Both are credited in plugin/THIRD-PARTY-NOTICES.txt.

import * as path from 'node:path';

/** A check id and the regex that decides it. */
export interface Pattern {
  readonly id: string;
  readonly re: RegExp;
}

/** A pattern list and the readings of a text it is tested against; each reading keeps every line break in place. */
export interface Check {
  readonly patterns: readonly Pattern[];
  readonly readings: ReadonlyArray<(text: string) => string>;
}

export const INJECTION: readonly Pattern[] = [
  {
    id: 'ignore-previous-instructions',
    re: /ignore\s+(all\s+)?previous\s+instructions/i,
  },
  {
    id: 'ignore-above-instructions',
    re: /ignore\s+(all\s+)?above\s+instructions/i,
  },
  { id: 'disregard-previous', re: /disregard\s+(all\s+)?previous/i },
  {
    id: 'forget-instructions',
    re: /forget\s+(all\s+)?(your\s+)?instructions/i,
  },
  {
    id: 'override-system-prompt',
    re: /override\s+(system|previous)\s+(prompt|instructions)/i,
  },
  { id: 'you-are-now', re: /you\s+are\s+now\s+(?:a|an|the)\s+/i },
  { id: 'act-as', re: /act\s+as\s+(?:a|an|the)\s+(?!plan|phase|wave)/i },
  { id: 'pretend-to-be', re: /pretend\s+(?:you(?:'re| are)\s+|to\s+be\s+)/i },
  {
    id: 'from-now-on',
    re: /from\s+now\s+on,?\s+you\s+(?:are|will|should|must)/i,
  },
  {
    id: 'reveal-prompt',
    re: /(?:print|output|reveal|show|display|repeat)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions)/i,
  },
  { id: 'role-tag', re: /<\/?(?:system|assistant|human)>/i },
  { id: 'system-marker', re: /\[SYSTEM\]/i },
  { id: 'inst-marker', re: /\[INST\]/i },
  { id: 'sys-marker', re: /<<\s*SYS\s*>>/i },
  {
    id: 'when-summarising-retain',
    re: /when\s+(?:summari[sz]ing|compressing|compacting),?\s+(?:retain|preserve|keep)\s+(?:this|these)/i,
  },
  {
    id: 'instruction-is-permanent',
    re: /this\s+(?:instruction|directive|rule)\s+is\s+(?:permanent|persistent|immutable)/i,
  },
  {
    id: 'preserve-rules-through',
    re: /preserve\s+(?:these|this)\s+(?:rules?|instructions?|directives?)\s+(?:in|through|after|during)/i,
  },
  {
    id: 'retain-through-summary',
    re: /(?:retain|keep)\s+(?:this|these)\s+(?:in|through|after)\s+(?:summar|compress|compact)/i,
  },
];

// Zero-width characters, word joiners, bidi controls, line and paragraph separators, the narrow no-break space, soft hyphen, BOM.
const INVISIBLE = /[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD\u2060-\u2069]/gu;
// U+E0000 to U+E007F: an invisible instruction vector. U+E0020 to U+E007E mirror printable ASCII.
const TAG = /[\u{E0000}-\u{E007F}]/gu;
const ASCII_TAG = /[\u{E0020}-\u{E007E}]/gu;
const TAG_OFFSET = 0xe0000;
// UTS #51 Annex C: U+1F3F4, then a CLDR subdivision id or three-digit region in tag
// digits and small letters (UTS #35: a region of two letters or three digits, then
// one to four letters or digits), then CANCEL TAG.
const TAG_FLAG =
  /\u{1F3F4}(?:[\u{E0061}-\u{E007A}]{2}[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]{1,4}|[\u{E0030}-\u{E0039}]{3}[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]{0,4})\u{E007F}/gu;
// A joiner inside an emoji sequence: after a pictograph and an optional
// variation selector or skin tone, before a pictograph.
const EMOJI_JOINER =
  /(\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?)\u200D(?=\p{Extended_Pictographic})/gu;

const codePointOf = (char: string): number => char.codePointAt(0) ?? 0;

const tagsDecoded = (text: string): string =>
  text.replace(ASCII_TAG, (tag) =>
    String.fromCodePoint(codePointOf(tag) - TAG_OFFSET),
  );

// Decoded, with every invisible character and every other tag character gone, so a split word joins again.
const invisibleStripped = (text: string): string =>
  tagsDecoded(text.replace(INVISIBLE, '')).replace(TAG, '');

const withoutFlags = (text: string): string => text.replace(TAG_FLAG, '');

const asWritten = (text: string): string => text;

const STRAY_TAG: Pattern = {
  id: 'unicode-tag-block',
  re: /[\u{E0000}-\u{E007F}]/u,
};

/**
 * What the memory gate tests. The injection patterns read the text with its
 * tag characters decoded, both as written and with invisible characters
 * stripped: `\s` matches U+2028, U+2029, U+202F, and U+FEFF, which stripping
 * would delete from between two words. A tag character outside an emoji flag
 * matches `unicode-tag-block`. An invisible character alone matches nothing.
 */
export const GATE_CHECKS: readonly Check[] = [
  { patterns: INJECTION, readings: [tagsDecoded, invisibleStripped] },
  { patterns: [STRAY_TAG], readings: [withoutFlags] },
];

export const KEYS: readonly Pattern[] = [
  {
    id: 'aws-access-key',
    re: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\b/,
  },
  { id: 'github-classic-pat', re: /ghp_[0-9a-zA-Z]{36}/ },
  { id: 'github-fine-grained-pat', re: /github_pat_\w{82}/ },
  {
    id: 'anthropic-api-key',
    re: /\b(sk-ant-api03-[a-zA-Z0-9_-]{93}AA)(?:[`'"\s;]|\\[nr]|$)/,
  },
  {
    id: 'openai-api-key',
    re: /\b(sk-(?:proj|svcacct|admin)-(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})T3BlbkFJ(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})\b|sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20})(?:[`'"\s;]|\\[nr]|$)/,
  },
  { id: 'slack-bot-token', re: /xoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/ },
  // gitleaks' header alone: its lazy body quantifier is quadratic on repeated headers, and any bound on it misses a longer key.
  {
    id: 'private-key-block',
    re: /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----/i,
  },
];

/** What the key check tests: the key patterns, on the text as written. */
export const KEY_CHECKS: readonly Check[] = [
  { patterns: KEYS, readings: [asWritten] },
];

const hits = (checks: readonly Check[], text: string): string[] =>
  checks.flatMap(({ patterns, readings }) => {
    const read = readings.map((reading) => reading(text));
    return patterns
      .filter(({ re }) => read.some((reading) => re.test(reading)))
      .map(({ id }) => id);
  });

/** Ids the memory gate withholds `text` for, in list order. Empty means it prints. */
export const gateHits = (text: string): string[] => hits(GATE_CHECKS, text);

/** Ids of the key patterns that match `text`, in list order. Empty means clean. */
export const keyHits = (text: string): string[] => hits(KEY_CHECKS, text);

/**
 * Ids of the key patterns, then the gate's, that match `text`. The lint
 * withholds a store text it quotes for any of them, and the lint and the gate
 * both withhold a store name they print.
 */
export const printedHits = (text: string): string[] => [
  ...keyHits(text),
  ...gateHits(text),
];

const withheldName = (ids: readonly string[]): string =>
  `(withheld name: ${ids.join(', ')})`;

/**
 * `names` with each segment between `separator`s that `printedHits` matches
 * read as `(withheld name: <ids>)`. A match that only the joined segments
 * make, such as a role tag split by a `/`, withholds them all.
 */
export function withheldNames(names: string, separator = '/'): string {
  const joined = names
    .split(separator)
    .map((name) => {
      const ids = printedHits(name);
      return ids.length === 0 ? name : withheldName(ids);
    })
    .join(separator);
  const across = printedHits(joined);
  return across.length === 0 ? joined : withheldName(across);
}

/**
 * `file` with its names below `base` checked as `withheldNames` checks them,
 * and `base` kept as written. A file outside `base` has every name checked.
 * A file with no match comes back unchanged.
 */
export function withheldPath(file: string, base: string): string {
  const relative = path.relative(base, file);
  const inside = !relative.startsWith('..') && !path.isAbsolute(relative);
  if (!inside) return withheldNames(file, path.sep);
  const checked = withheldNames(relative, path.sep);
  return checked === relative ? file : path.join(base, checked);
}

// Unicode's notation: at least four hex digits.
const codePointName = (char: string): string =>
  `U+${codePointOf(char).toString(16).toUpperCase().padStart(4, '0')}`;

/**
 * The invisible characters in `text` that no emoji sequence uses, as
 * `U+00AD`, each once, in order of first appearance. Tag characters are the
 * gate's: `GATE_CHECKS` names a stray one.
 */
export function invisibleCharacters(text: string): string[] {
  const loose = text.replace(EMOJI_JOINER, '$1');
  const names = [...loose.matchAll(INVISIBLE)].map(([char]) =>
    codePointName(char),
  );
  return [...new Set(names)];
}
