// The patterns the memory lint and the memory start hook's gate both read.
// Injection patterns are copied from get-shit-done-cc 1.42.3, hooks/gsd-read-injection-scanner.js.
// Key patterns are translated from gitleaks at commit 5f6ec56cfa6f8c67648d863582c7ae2f206d5c1c, config/gitleaks.toml.
// Both are credited in plugin/THIRD-PARTY-NOTICES.txt.

interface Pattern {
  readonly id: string;
  readonly re: RegExp;
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
  // zero-width, RTL override, soft hyphen, BOM
  {
    id: 'invisible-unicode',
    re: /[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD\u2060-\u2069]/,
  },
  // U+E0000 to U+E007F: an invisible instruction vector
  { id: 'unicode-tag-block', re: /[\u{E0000}-\u{E007F}]/u },
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

const hits = (patterns: readonly Pattern[], text: string): string[] =>
  patterns.filter(({ re }) => re.test(text)).map(({ id }) => id);

/** Ids of the injection patterns that match `text`, in list order. Empty means clean. */
export const injectionHits = (text: string): string[] => hits(INJECTION, text);

/** Ids of the key patterns that match `text`, in list order. Empty means clean. */
export const keyHits = (text: string): string[] => hits(KEYS, text);
