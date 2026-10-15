/**
 * Claude Code's session listing, `claude agents --json --all`, parsed at the
 * boundary. It lists interactive sessions beside background jobs; an
 * interactive row carries no `id` or `state`.
 */

import * as v from 'valibot';
import { type ClaudeRunner, printedStreams } from './profile-launch.js';

/** The listing's arguments to `claude`. */
export const LISTING_ARGS = ['agents', '--json', '--all'];
/** The listing's command line, as refusals name it. */
export const LISTING = `claude ${LISTING_ARGS.join(' ')}`;

const OptionalText = v.nullish(v.string());

// valibot's object accepts an array, so the array check runs on the raw row.
const JobSchema = v.pipe(
  v.unknown(),
  v.check((row) => !Array.isArray(row), 'must be an object'),
  v.object({
    id: OptionalText,
    kind: OptionalText,
    name: OptionalText,
    state: OptionalText,
  }),
  v.transform((row) => ({
    id: row.id ?? undefined,
    kind: row.kind ?? undefined,
    name: row.name ?? undefined,
    state: row.state ?? undefined,
  })),
);

/** One row of the listing: a background job, or an interactive session with no `id`. */
export type Job = v.InferOutput<typeof JobSchema>;

const ListingSchema = v.array(JobSchema);

// The listing's text as JSON, or the reason it is not.
function parseJson(text: string): { value: unknown } | { issue: string } {
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return { issue: `${LISTING} printed a listing that is not JSON: ${why}` };
  }
}

/**
 * Every session `claude agents --json --all` lists, run in `cwd`. A failed run,
 * or a listing that is not a JSON array of objects, refuses.
 */
export function listJobs(
  run: ClaudeRunner,
  cwd: string,
  timeoutMs = 30_000,
): { jobs: Job[] } | { issues: string[] } {
  const result = run(LISTING_ARGS, { cwd, timeoutMs });
  if (result.timedOut) {
    return { issues: [`${LISTING} did not return in time.`] };
  }
  if (result.code !== 0) {
    return {
      issues: [
        `${LISTING} failed with exit code ${result.code}.`,
        ...printedStreams(result),
      ],
    };
  }
  const json = parseJson(result.stdout);
  if ('issue' in json) return { issues: [json.issue] };
  const parsed = v.safeParse(ListingSchema, json.value);
  if (!parsed.success) {
    const [first] = parsed.issues;
    const where = v.getDotPath(first) ?? '(root)';
    return {
      issues: [
        `${LISTING} printed a listing that does not parse: ${where}: ${first.message}`,
      ],
    };
  }
  return { jobs: parsed.output };
}
