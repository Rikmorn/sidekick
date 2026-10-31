> Research for the `memory` design (`docs/designs/memory/`), which PM planned as #270 to #281; it serves #269. Written 2026-10-30 by the operator and Claude. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Memory base trial: method (2026-10-30)

Three subagents trialled basic-memory, claude-obsidian, and episodic-memory in parallel, each on its own copy of one invented fixture. Each followed the shared brief, the scenarios, and the fixture script below. The results are the three `2026-10-30-trial-*.md` reports beside this one.

## Safety outcome

The brief forbade any user-level change, and isolating each tool's own paths did not achieve it. episodic-memory's summariser ran an older Claude Code bundled with its SDK against the real `~/.claude`. That binary dropped two keys from `~/.claude/settings.json`, which were restored the same evening. A trial of a tool that launches its own Claude Code needs a separate config folder for that process, not only redirected tool paths.

## Scenarios

Each scenario replays one of the operator's cases from `docs/designs/memory/design.md` §Cases. A write run leaves knowledge, and a read run in a fresh session tests whether it comes back. Read prompts never say where the knowledge is: finding it unprompted is the test.

Paths are relative to the fixture root. `alpha` is the main checkout on `main`. `alpha-wt-retry` is a worktree of alpha on `feat/retry`. `beta` is a sibling repo.

Run every scenario out of the box, with the tool's own recommended setup, so the result shows what the base does alone. The gap is what sidekick's wrapper would have to add.

| Id | Case | Run | Where | Prompt | Passes when |
|---|---|---|---|---|---|
| S1w | C1 | write | `alpha` | We're designing webhook retries for alpha. Decision: retry 3 times with exponential backoff starting at 30 seconds, then dead-letter. Open question: should a 410 response skip retries? Next step: write the dead-letter handler. Save context before you finish. | Something is saved |
| S1r | C1 | read | `alpha-wt-retry` | Continue the webhook retry work. What did we decide, and what's next? | Names 3 retries, 30-second backoff, dead-letter, the 410 question, and the next step |
| S2w | C8 | write | `alpha-wt-retry` | Prod support, unrelated to this branch: a merchant reports duplicate refunds. We found the refund call retried after a timeout although the first call had succeeded; the refund call sends no idempotency key. Save what we found. | Something is saved |
| S2r | C8 | read | `alpha` | Have we seen duplicate refunds before? What was the cause? | Names the retry after timeout and the missing idempotency key |
| S3a, S3b | C7 | write, at the same moment | `alpha` and `alpha-wt-retry` | S3a: For the webhook retry work, decision: the backoff caps at 10 minutes. Save context. S3b: For the webhook retry work, finding: the vendor sends an event id on every webhook, so use it to discard duplicates. Save context. | Both facts are in the store afterwards, and S1w's facts are still there |
| S4w | C2 | write, no save asked | `alpha` | For the webhook retry work, decision: a 410 response is permanent, so it skips retries entirely. | Nothing asked; observe whether anything is captured |
| S4r | C2 | read | `alpha-wt-retry` | For the webhook retries, do 410 responses get retried? | Answers that 410 skips retries, from the store or archive |
| S5w | C3 | write | `beta` | Fact about beta: its public API uses cursor pagination, page size 100, with the next cursor in the `next` field. Save it. | Something is saved |
| S5r | C3 | read | `alpha` | I need to call beta's API from alpha to list orders. How does beta's pagination work? | Answers from the store; reading beta's code cannot answer it |
| S6w | C5, G5 | ingest | per the tool | Ingest `sources/parcelco-api-v3.pdf` and `sources/returns-portal-notes.md` the way the tool intends: its inbox, or by asking a session. | The sources are in the store |
| S6r | C5, G5 | read | `beta` | What's ParcelCo's rate limit, and how many times does it retry a webhook? | 5 per second; 3 retries at 1, 5, and 25 minutes |
| S7w | C5 | write | `alpha` | I just used playground/bulk-close/run.ts to close stale returns for a merchant: dry run first with no flag, then --live, with --merchant <slug>. Save how to use it. | Something is saved |
| S7r | C5 | read | `alpha-wt-retry` | How do I run the bulk-close script again? | Gives the dry run, `--live`, and `--merchant`; the worktree has no playground folder |
| S8w | C4 | write | `alpha` | Here's how we release alpha: bump the version in package.json, run make check, tag vX.Y.Z, then write release notes. Save it as our release procedure. | Something is saved |
| S8r | C4 | read | `alpha-wt-retry` | Walk me through releasing alpha. Don't run anything. | Lists the four steps in order |

### What to record per run

- Pass, partial, or fail against the column, with the answer's key lines quoted.
- What loaded at session start, and its size in characters.
- Which tools the session called to save or find, and how many turns it took.
- Which files changed in the store, auto-memory, or anywhere else.
- Wall-clock time, and the run's cost when `--output-format json` reports it.

After the last run, record the store's tree, one representative note in full, and how the store looks to a reader opening it as an Obsidian vault: links, front matter, an index.

## Shared brief

You are trialling one community memory tool for Claude Code, out of the box, so the operator can see what it does on their real cases before choosing a base. The design is `/Users/roberto.sousa/Documents/Projects/sidekick/docs/designs/memory/design.md`: read §Cases and §Goals first. Then read `scenarios.md` and `fixture.sh` beside this brief.

`<S>` below means `/private/tmp/claude-501/-Users-roberto-sousa-Documents-Projects-sidekick/40d9a6bd-0d61-4255-988c-db47d3a71c55/scratchpad/spike`. Your stack's folder is `<S>/<stack>/`, named in your prompt.

### Setup

1. Run `<S>/fixture.sh <S>/<stack>` to build your own fixture. Other agents build theirs in parallel, so never touch another stack's folder.
2. Clone the tool into `<S>/<stack>/vendor/` and record the commit you read.
3. Before running anything, read the tool's hooks, install scripts, and config code. Find every path it writes: config, data, cache, index, models. Redirect each one into `<S>/<stack>/` with an environment variable or a flag. A path you cannot redirect is a stop: report it and do not run the tool.

### Safety boundaries

These are firm, because the operator's real sessions share this machine.

- Change no user-level Claude Code state. Never run `claude plugin install`, `claude plugin marketplace add`, `claude mcp add` (it writes `~/.claude.json` even at local scope), a tool's own installer such as `bm install claude-code`, or any edit to `~/.claude/settings.json`, `~/.claude/plugins/`, or `~/.claude.json`.
- Load a plugin only with `--plugin-dir <its folder>`, and an MCP server only with `--mcp-config <file> --strict-mcp-config`.
- Read or index no transcript or memory under `~/.claude/projects/` except your own sandbox sessions' folders, whose names start with your fixture's path in dashed form.
- Child sessions run as `claude -p "<prompt>"` with `--permission-mode acceptEdits`, an `--allowedTools` list naming only what the tool needs, `--add-dir` for the store, `--max-turns 20`, and `--output-format json`. Never pass `--dangerously-skip-permissions` or `bypassPermissions`. Use the default model.
- Pass auto-memory into your store, as the operator's direction says: `--settings '{"autoMemoryDirectory":"<S>/<stack>/store/auto-memory/<repo>"}'`, with `alpha` for both alpha checkouts and `beta` for beta. Your prompt may override this. Record whether a session saved to auto-memory, to the tool, or to both.
- Flag any code that sends data off the machine, beyond the model calls Claude Code itself makes.

### Running

- Run the scenarios in `scenarios.md` in order. Run S3a and S3b at the same moment, as two background processes, and wait for both.
- Run a scenario's read only after its write has finished, and after whatever sync or filing step the tool needs. If a step is manual, say so, since the operator would have to do it.
- Stop setup after three failed attempts and report what blocked it. Cap the trial at 40 child sessions.
- Record each run as `scenarios.md` §What to record per run says.

### When you finish

1. Check the baseline again. `~/.basic-memory`, `~/basic-memory`, `~/.config/superpowers`, `~/.config/episodic-memory`, and `~/.episodic-memory` were absent on 2026-10-30. `~/.claude/settings.json` was 3534 bytes, modified Oct 27 20:51:31. `~/.claude/plugins/installed_plugins.json` was 32796 bytes, modified Oct 28 12:15:36. Report any change. `~/.claude.json` changes on every session, since it is Claude Code's own bookkeeping; report it, but it is not a breach.
2. Write `<S>/<stack>/results.md`:
   - the setup, with the commit, every redirected path, and any manual step;
   - one table row per scenario, with pass, partial, or fail and the evidence;
   - the store's tree and one note in full;
   - the cost and time totals;
   - what the base did alone, and the gap a wrapper would have to fill, per case.
3. Return a summary of no more than 400 words: the pass, partial, and fail count, the three most telling observations, and any safety finding.

## Fixture

```bash
#!/bin/bash
# Builds a fake product family for the memory spike: two repos, a worktree on a
# feature branch, a gitignored one-off script, and two outside source documents.
# Usage: fixture.sh <root>. Everything it writes is under <root>; all content is invented.
set -euo pipefail

ROOT="$1"
[ -e "$ROOT/family" ] && { echo "fixture exists at $ROOT/family" >&2; exit 1; }
mkdir -p "$ROOT/family" "$ROOT/sources"
cd "$ROOT/family"

git_init() {
  git init -q -b main "$1"
  git -C "$1" config user.email spike@example.invalid
  git -C "$1" config user.name spike
}

# alpha: a webhook-receiving service. Its playground folder is gitignored, like the work repo's.
git_init alpha
cat > alpha/README.md <<'EOF'
# alpha

Receives carrier webhooks and issues refunds. Run `make check` before any commit.
EOF
printf 'playground/\n' > alpha/.gitignore
cat > alpha/package.json <<'EOF'
{ "name": "alpha", "version": "1.4.0", "private": true }
EOF
mkdir -p alpha/src
cat > alpha/src/webhooks.ts <<'EOF'
export async function onWebhook(body: unknown): Promise<void> {
  // TODO: retries
  void body;
}
EOF
git -C alpha add -A && git -C alpha commit -q -m "alpha: initial"
git -C alpha branch feat/retry
git -C alpha worktree add -q ../alpha-wt-retry feat/retry

mkdir -p alpha/playground/bulk-close
cat > alpha/playground/bulk-close/run.ts <<'EOF'
const args = process.argv.slice(2);
const live = args.includes("--live");
const merchant = args[args.indexOf("--merchant") + 1];
console.log(`${live ? "closing" : "would close"} stale returns for ${merchant}`);
EOF

# beta: a sibling service in the same family. Its code does not state its pagination rules.
git_init beta
cat > beta/README.md <<'EOF'
# beta

The public orders API for the family.
EOF
mkdir -p beta/src
cat > beta/src/orders.ts <<'EOF'
export function listOrders(_cursor?: string) {
  return { items: [] as unknown[] };
}
EOF
git -C beta add -A && git -C beta commit -q -m "beta: initial"

# Outside sources: a vendor API PDF and a Markdown integration note.
cat > "$ROOT/sources/parcelco-api-v3.txt" <<'EOF'
ParcelCo Carrier API, version 3. Integration guide.

Authentication: send the X-Api-Key header on every request.
Rate limit: 5 requests per second per key. Over the limit returns HTTP 429 with a Retry-After header.
Webhooks: ParcelCo retries a failed webhook delivery 3 times, at 1, 5, and 25 minutes.
Every webhook carries a unique event_id; receivers should use it to discard duplicates.
Labels: POST /v3/labels returns a PDF label and a tracking number.
EOF
cupsfilter -i text/plain "$ROOT/sources/parcelco-api-v3.txt" > "$ROOT/sources/parcelco-api-v3.pdf" 2>/dev/null
rm "$ROOT/sources/parcelco-api-v3.txt"
cat > "$ROOT/sources/returns-portal-notes.md" <<'EOF'
# Returns portal integration notes

- The portal authenticates a shopper by order number plus postcode.
- After 5 failed lookups in 10 minutes, the portal locks that order for 1 hour.
- Refund amounts are always in minor units (pence).
EOF

echo "fixture ready: $ROOT/family/{alpha,alpha-wt-retry,beta} and $ROOT/sources"
```
