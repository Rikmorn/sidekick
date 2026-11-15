// A loop unit's text comes from one GitHub issue. Code filters it so only the
// operator's own account's words reach a worker (#367).
import * as v from 'valibot';
import { keyHits } from './memory-patterns.js';
import { parseOrigin, type Runner } from './pm-data.js';

export type UnitComment = { author: string; body: string; createdAt: string };

export type UnitIssue = {
  number: number;
  title: string;
  body: string;
  url: string;
  comments: UnitComment[];
  /** Comments written, or last edited, by an account other than the viewer's. */
  dropped: number;
};

/** The most comments one read returns; paging waits for a loop that needs it. */
export const COMMENT_CAP = 100;

const QUERY = `query UnitIssue($owner: String!, $repo: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      state title body url
      author { login }
      editor { login }
      comments(first: ${COMMENT_CAP}) {
        totalCount
        nodes { author { login } editor { login } body createdAt }
      }
    }
  }
}`;

// A null author is a deleted account; a null editor means never edited.
const Actor = v.nullable(v.object({ login: v.string() }));

const Response = v.object({
  data: v.object({
    viewer: v.object({ login: v.string() }),
    repository: v.nullable(
      v.object({
        issue: v.nullable(
          v.object({
            state: v.string(),
            title: v.string(),
            body: v.string(),
            url: v.string(),
            author: Actor,
            editor: Actor,
            comments: v.object({
              totalCount: v.number(),
              nodes: v.array(
                v.object({
                  author: Actor,
                  editor: Actor,
                  body: v.string(),
                  createdAt: v.string(),
                }),
              ),
            }),
          }),
        ),
      }),
    ),
  }),
});

const refuse = (...issues: string[]): { issues: string[] } => ({ issues });

const keyReasons = (where: string, text: string): string[] => {
  const ids = keyHits(text);
  return ids.length === 0
    ? []
    : [`the ${where} matches the key check (${ids.join(', ')})`];
};

export function fetchUnitIssue(
  run: Runner,
  repoTop: string,
  issue: number,
  timeoutMs = 30_000,
): { issue: UnitIssue } | { issues: string[] } {
  const origin = run('git', ['remote', 'get-url', 'origin'], repoTop);
  if (origin.code !== 0) {
    return refuse(`origin is not readable: ${origin.stderr.trim()}`);
  }
  const slug = parseOrigin(origin.stdout);
  if (!slug) return refuse('origin is not a GitHub repository');

  const r = run(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `query=${QUERY}`,
      '-f',
      `owner=${slug.owner}`,
      '-f',
      `repo=${slug.repo}`,
      '-F',
      `number=${issue}`,
    ],
    repoTop,
    { timeoutMs },
  );
  if (r.code !== 0) {
    return refuse(`gh failed: ${r.stderr.trim() || `exit ${r.code}`}`);
  }

  const parsed = (() => {
    try {
      return v.safeParse(Response, JSON.parse(r.stdout));
    } catch {
      return null;
    }
  })();
  if (!parsed?.success) {
    return refuse('gh returned an unexpected response for the issue');
  }

  const { viewer, repository } = parsed.output.data;
  const found = repository?.issue;
  if (!found) return refuse(`no issue #${issue} in ${slug.owner}/${slug.repo}`);

  const trusted = viewer.login;
  const isTrusted = (a: { login: string } | null): boolean =>
    a?.login === trusted;

  const kept = found.comments.nodes.filter(
    (c) => isTrusted(c.author) && (c.editor === null || isTrusted(c.editor)),
  );
  const unitIssue: UnitIssue = {
    number: issue,
    title: found.title,
    body: found.body,
    url: found.url,
    comments: kept.map((c) => ({
      author: c.author?.login ?? trusted,
      body: c.body,
      createdAt: c.createdAt,
    })),
    dropped: found.comments.nodes.length - kept.length,
  };

  const reasons = [
    ...(found.state === 'OPEN' ? [] : [`issue #${issue} is closed`]),
    ...(isTrusted(found.author)
      ? []
      : [`issue #${issue} has an author other than the trusted account`]),
    ...(found.editor === null || isTrusted(found.editor)
      ? []
      : [`issue #${issue} was last edited by another account`]),
    ...(found.comments.totalCount > COMMENT_CAP
      ? [
          `issue #${issue} has more than ${COMMENT_CAP} comments, the most a unit reads`,
        ]
      : []),
    ...keyReasons('title', found.title),
    ...keyReasons('body', found.body),
    ...kept.flatMap((c, i) => keyReasons(`comment ${i + 1}`, c.body)),
  ];
  return reasons.length > 0 ? refuse(...reasons) : { issue: unitIssue };
}

export function renderUnitFile(u: UnitIssue): string {
  const comments = u.comments.map(
    (c) => `### ${c.author}, ${c.createdAt}\n\n${c.body}`,
  );
  const dropped =
    u.dropped === 0
      ? 'No comments were dropped.'
      : `${u.dropped} ${u.dropped === 1 ? 'comment was' : 'comments were'} dropped: written or last edited by other accounts.`;
  return [
    `# Issue #${u.number}: ${u.title}`,
    u.url,
    '## Body',
    u.body,
    '## Comments',
    ...(comments.length > 0 ? comments : ['None.']),
    dropped,
  ]
    .join('\n\n')
    .concat('\n');
}
