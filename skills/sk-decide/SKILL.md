---
name: sk-decide
description: Capture a durable system rule as a MADR decision doc at .sidekick/decisions/<slug>.md. No-arg auto-scans the most-recent RFC for candidates; explicit <topic> skips auto-scan. M1 does not support --amend / --supersede.
user-invocable: true
disable-model-invocation: true
argument-hint: [topic]
allowed-tools: Read, Grep, Bash, Agent, Write, Edit
---

You orchestrate the capture of a single durable rule into a MADR decision doc at `.sidekick/decisions/<slug>.md`. The shape is: validate inputs, run branch precheck, resolve recent RFC hints, dispatch `sk-decision-drafter` for a draft, dispatch the decision quorum in parallel (membership from the `verifiers` CLI — bundled structural + coherence checkers plus any operator-mounted verifiers), write the file, iterate with the user, commit.

This slash command runs in the main session because the runtime forbids subagents from dispatching other subagents (per `.claude/rules/sk-agent-prompts.md` "Where orchestrators must live"). The orchestration logic lives here; the focused cognitive work lives in the two subagents named above plus the `branch-precheck` CLI helper.

<constraints>

- Write only to `.sidekick/decisions/<slug>.md`. The skill does not modify `src/`, RFC source files, or any other tracked path.
- Source RFC files (`.sidekick/plans/*/RFC.md`) are read-only from this skill's perspective — the drafter reads them; nothing in this flow edits them.
- Honour the `branch-precheck` CLI's verdict. A `hard_stop` verdict halts the flow with the helper's message surfaced verbatim.
- `--amend` and `--supersede` are deferred to v1.x and rejected at Step 1.

</constraints>

<reasoning>

Before each significant choice, externalise the reasoning in prose so the flow is auditable:

- Whether the invocation includes a deferred flag (`--amend` / `--supersede`) — these short-circuit the flow before any dispatch.
- Whether the resolved git state lets the operation proceed, or whether the precheck CLI hard-stopped.
- Which `.sidekick/plans/*/RFC.md` files are recent enough to pass as `rfc_hint_paths` (top 3 by commit time).
- How to interpret the drafter's returned `mode` — `draft_ready` continues, `no_topic_candidate` and `existing_decision` hard-stop with distinct messages.
- When a checker fails, what its `issues` list tells the drafter — re-dispatch the drafter with the issues collapsed into a prose `feedback` string so it can target its edits.
- When the loop limit (3 drafter re-dispatches against the quorum) is reached, the right move is to halt and let the user retry rather than ship a malformed doc.
- When the user asks for edits during Step 8, the same re-dispatch shape applies, but there is no loop cap — the user drives.

The reasoning is internal scratchwork shaping dispatches and writes; it does not appear in the final rendered output.

</reasoning>

<inputs>

User invokes `/sk-decide [<topic>]`.

| Arg | Required | Effect |
|---|---|---|
| (no arg) | — | Auto-scan mode. Drafter scans the resolved `rfc_hint_paths` for candidate topics and surfaces one. |
| `<topic>` | optional | Explicit-topic mode. Drafter uses `<topic>` as the slug seed and skips auto-scan. |
| `--amend <doc>` / `--supersede <doc>` | NOT supported | Hard-stop at Step 1 with `error: deferred_flags`. Available in v1.x. |

</inputs>

<hard_stops>

Emit only the structured-error block (no preamble, no progress narration, no sign-off) for any of:

- `error: deferred_flags` — `--amend` or `--supersede` was passed. M1 does not implement either.
- `error: ambiguous_git_state` — the `branch-precheck` CLI returned `verdict: hard_stop`. Surface the helper's `hard_stop_message` verbatim.
- `error: no_topic_candidate` — drafter returned `mode: "no_topic_candidate"`. Surface the drafter's `reason` field.
- `error: existing_decision` — drafter returned `mode: "existing_decision"`. Surface the existing path and note that `--amend` / `--supersede` are deferred to v1.x. (Informational hard-stop, not a failure.)
- `error: decision_quorum_check_loop_exhausted` — 3 drafter re-dispatches all failed a binding member of the decision quorum. The user can re-invoke after revising the source material.
- `error: slug_collision` — the Write target already exists on disk and is not the path the drafter pointed at. Defensive guard; should be rare because the drafter checks for existing decisions itself.

Hard-stop format:

```
/sk-decide halted.

error: <code>
Reason: <one-line description>
```

</hard_stops>

<workflow>

Nine steps, linear. Steps 7 and 8 loop on feedback; the rest run once.

### Step 1 — Validate inputs

Confirm no deferred flags are present. If `--amend` or `--supersede` was passed in any form, hard-stop with `error: deferred_flags`. Otherwise capture the optional positional `<topic>` (may be empty for no-arg mode) and continue.

### Step 2 — Branch precheck

Invoke the helper CLI directly:

```bash
"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" branch-precheck --operation decide
```

Parse the JSON object on stdout. On `verdict: "hard_stop"`, emit the `error: ambiguous_git_state` block surfacing the helper's `hard_stop_message` verbatim and stop. On `verdict: "proceed"`, continue silently. (The helper's policy explicitly allows the default branch for `--operation decide`; other reachable hard-stops include mid-rebase / mid-merge / mid-cherry-pick / detached_head / diverged_from_remote.)

### Step 3 — Resolve `rfc_hint_paths`

Walk `.sidekick/plans/*/RFC.md`, sort by the last-commit timestamp, and take the top 3. A natural form is:

```bash
for f in $(ls .sidekick/plans/*/RFC.md 2>/dev/null); do
  printf '%s %s\n' "$(git log -1 --format=%at -- "$f" 2>/dev/null || echo 0)" "$f"
done | sort -rn | awk '{print $2}' | head -3
```

If no `RFC.md` files exist, `rfc_hint_paths` is an empty list — the drafter handles the no-hint case by emitting `no_topic_candidate` when `topic` is also absent. (Explicit `<topic>` without any RFC still drafts a fresh decision.)

### Step 4 — Dispatch sk-decision-drafter

Use the `Agent` tool with `subagent_type: "sk-decision-drafter"`. Pass the input object:

```json
{
  "topic": "<topic-or-omitted>",
  "repo_root": "<absolute-repo-root>",
  "rfc_hint_paths": ["<abs-path-1>", "<abs-path-2>", "<abs-path-3>"],
  "today": "<YYYY-MM-DD>"
}
```

Include `topic` only when the user supplied a positional arg. `repo_root` is the consuming repo's absolute root (the directory the slash command runs from). `today` is the system date from `date +%Y-%m-%d` (Bash), passed so the drafter never guesses the decision's `date:`.

### Step 5 — Parse drafter mode

Extract the single JSON object from the trailing ```json``` fence of the drafter's return. Branch on `mode`:

- `draft_ready` — capture `draft_path` and `draft_text` and `source_rfc` (an absolute path or `null`). Derive `slug` as the basename of `draft_path` minus the `.md` extension. Continue to Step 6.
- `no_topic_candidate` — emit `error: no_topic_candidate`. Use the drafter's `reason` as the one-line reason. Stop.
- `existing_decision` — emit `error: existing_decision`. Reason names the existing path and notes that `--amend` / `--supersede` are deferred to v1.x. Stop.

### Step 6 — Write the draft to disk

Use the `Write` tool to create the file at the absolute path derived from `draft_path` with `draft_text` as its content. Before writing, defensively check whether the target already exists on disk; if it does and is not the path the drafter just pointed at, emit `error: slug_collision` with the path and stop. (The drafter checks for existing decisions before drafting, so this guard exists for race conditions and stale-state safety, not as the primary gate.)

### Step 7 — Decision quorum loop

Resolve the quorum via Bash — `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" verifiers --surface decision` — and parse its JSON for `members` + `warnings` (surface any warnings in prose). In a single message, dispatch every member in parallel — one Agent call each, `subagent_type` = the member's `agent`, with `{ "artifact_path": "<abs-path-to-.sidekick/decisions/<slug>.md>", "artifact_type": "decision" }`. **When `source_rfc` is non-null, add `"related_paths": { "rfc": "<source_rfc>" }`** to every member except `sk-structural-checker` (whose contract takes no related paths) — so the coherence check also verifies the decision against its source RFC (internal coherence by default, against the RFC when `related_paths.rfc` is supplied). When `source_rfc` is `null`, omit `related_paths` — the check stays internal-only.

The quorum is sealed from the producer: each checker receives the decision doc by path and reads it fresh from disk — never `sk-decision-drafter`'s reasoning, its returned JSON, or a prior round's verdicts. Feedback flows producer-ward only (failing binding members' issues collapse into the re-dispatch `feedback`); preserve this seal on any future edit.

Parse each trailing ```json``` fence (`{ verdict, issues? }`; operator members follow the same artifact-checker contract). On all **binding** members `verdict: "pass"`, continue to Step 8 — advisory (operator) findings never gate; carry their `issues` into Step 8 and show them to the user alongside the draft. A malformed return from an *advisory* member is noted in prose and its verdict ignored (a misauthored operator verifier must not brick the flow); a malformed *binding* return stays `error: subagent_failed`.

On any **binding** member's `verdict: "fail"`, collapse the failing binding members' issues into a short prose summary (e.g., "## Consequences contradicts the chosen option; frontmatter status is missing") and re-dispatch `sk-decision-drafter` with that summary as `feedback`. Take the returned `draft_text`, write it back through the `Write` tool (overwrite), and re-run the quorum.

Cap this loop at 3 drafter re-dispatches. If the third re-dispatch still fails a binding checker, emit `error: decision_quorum_check_loop_exhausted` with a one-line summary of the latest issues and stop.

### Step 8 — User confirmation / edit loop

Show the file path and its current content to the user, then ask whether to commit or what to change. A natural form is `AskUserQuestion` with two options ("commit as is" / "request edits") plus a free-text channel; a plain prompt works equally well.

On a commit signal, continue to Step 9. On edit instructions, re-dispatch `sk-decision-drafter` with the user's edit text as `feedback`, write the updated `draft_text` back, re-run the quorum (Step 7's loop applies), and re-present to the user. The user drives this loop with no cap.

### Step 9 — Commit

Atomic commit covering the single new file:

```bash
git add .sidekick/decisions/<slug>.md
git commit -m "decide: capture <slug>"
```

Render the report per `<output_artifacts>` after the commit lands.

</workflow>

<dispatcher_parse_contracts>

Two subagents return structured deliverables. Each emits ONE JSON object inside a trailing ```json``` fence; the orchestrator extracts that block and ignores surrounding prose. (The branch-precheck CLI is the third boundary, but the helper writes plain JSON to stdout — no fence.)

### sk-decision-drafter

**Input:**

```json
{
  "topic": "<optional-kebab-slug>",
  "repo_root": "<absolute-path>",
  "rfc_hint_paths": ["<abs-path>", "..."],
  "feedback": "<optional-prose-from-checker-or-user>"
}
```

**Output (one of):**

```json
{ "mode": "draft_ready",       "draft_path": ".sidekick/decisions/<slug>.md", "draft_text": "<full markdown>" }
{ "mode": "no_topic_candidate", "reason":   "<one-line>" }
{ "mode": "existing_decision",  "path":     ".sidekick/decisions/<slug>.md" }
```

Mode → next step:

| Mode | Next step |
|---|---|
| `draft_ready` | Step 6 (Write) |
| `no_topic_candidate` | Hard-stop `error: no_topic_candidate` |
| `existing_decision` | Hard-stop `error: existing_decision` |

### sk-structural-checker

**Input:**

```json
{ "artifact_path": "<absolute-path>", "artifact_type": "decision" }
```

**Output (one of):**

```json
{ "verdict": "pass", "artifact_path": "<path>", "artifact_type": "decision" }
{ "verdict": "fail", "artifact_path": "<path>", "artifact_type": "decision",
  "issues": [ { "field": "<dotted>", "issue": "<text>" } ] }
```

Verdict → next step:

| Verdict | Next step |
|---|---|
| `pass` | Step 8 (user confirmation) |
| `fail` | Re-dispatch drafter with `feedback`; loop, capped at 3 |

### sk-coherence-checker

**Input:**

```json
{ "artifact_path": "<absolute-path>", "artifact_type": "decision" }
```

When `source_rfc` is non-null the dispatch carries `related_paths: { "rfc": "<source_rfc>" }`, so the checker also verifies the decision against its source RFC; when `source_rfc` is `null`, `related_paths` is omitted and the check is internal-only.

**Output (one of):**

```json
{ "verdict": "pass", "artifact_path": "<path>", "artifact_type": "decision" }
{ "verdict": "fail", "artifact_path": "<path>", "artifact_type": "decision",
  "issues": [ { "kind": "contradiction", "locus_a": { … }, "locus_b": { … }, "detail": "<text>" } ] }
```

Verdict → next step: `pass` continues; `fail` re-dispatches the drafter with `feedback` (loop, capped at 3 — shared with the structural checker's loop).

### branch-precheck CLI (stdout JSON)

Relevant fields:

- `verdict`: `"proceed"` | `"hard_stop"`
- `hard_stop_message`: present only when `verdict === "hard_stop"`

Verdict → next step:

| Verdict | Next step |
|---|---|
| `proceed` | Step 3 |
| `hard_stop` | Emit `error: ambiguous_git_state` with `hard_stop_message` |

</dispatcher_parse_contracts>

<output_artifacts>

After Step 9 commits, render the report below. The rendered terminal output is the deliverable; the file at `.sidekick/decisions/<slug>.md` is the artifact persisted to disk.

```markdown
# /sk-decide — <slug>

Mode: <auto-scan | explicit-topic>
Source: <rfc-hint-path-or-"none">

## Validation

Validation quorum (<the dispatched dimensions, e.g. structural + coherence>): PASS
Drafter re-dispatches: <N>/3
<one line per advisory finding, when any surfaced>


## Result

Wrote .sidekick/decisions/<slug>.md
Commit: <SHA> decide: capture <slug>
```

For hard-stops, emit only the canonical block defined in `<hard_stops>` — no preamble, no progress narration, no sign-off.

</output_artifacts>

<examples>

Three worked examples covering the common path, a hard-stop path, and a judgment path.

### Example 1 — Common path (explicit topic, clean quorum pass)

User invokes `/sk-decide cache-strategy-default-in-memory` on the default branch. One `.sidekick/plans/cache-rework/RFC.md` exists and is the most recent.

Reasoning: no deferred flags, so Step 1 passes. Branch precheck returns `proceed` (default branch is allowed for `decide`). The single RFC becomes the only entry in `rfc_hint_paths`. Dispatch the drafter with `{ topic: "cache-strategy-default-in-memory", repo_root, rfc_hint_paths }`. The drafter conducts Q&A, drafts the MADR, and returns `mode: "draft_ready"` with `draft_path: ".sidekick/decisions/cache-strategy-default-in-memory.md"` and a full `draft_text`. Slug derives to `cache-strategy-default-in-memory`. Write the file. Structural checker returns `verdict: "pass"`. Show the file to the user; the user replies "ship it". Commit lands as `decide: capture cache-strategy-default-in-memory`.

Output:

```markdown
# /sk-decide — cache-strategy-default-in-memory

Mode: explicit-topic
Source: .sidekick/plans/cache-rework/RFC.md

## Validation

Validation quorum (structural + coherence): PASS
Drafter re-dispatches: 0/3

## Result

Wrote .sidekick/decisions/cache-strategy-default-in-memory.md
Commit: 7a3b1cd decide: capture cache-strategy-default-in-memory
```

### Example 2 — Hard-stop on no_topic_candidate

User invokes `/sk-decide` with no arg. Two `.sidekick/plans/*/RFC.md` files exist but neither has a `## Decisions` or `## Locked decisions` section with unbatched candidates.

Reasoning: Step 1 passes (no flags, no topic). Branch precheck returns `proceed`. Step 3 finds two RFC files; both become `rfc_hint_paths`. The drafter scans them, finds no candidates worth surfacing, and returns `mode: "no_topic_candidate"` with `reason: "no recent RFC has unlocked decisions"`. The skill emits the hard-stop block and stops. No write, no commit.

Output:

```
/sk-decide halted.

error: no_topic_candidate
Reason: no recent RFC has unlocked decisions
```

### Example 3 — Judgment path (a checker fails once, drafter fixes, second pass)

User invokes `/sk-decide auth-token-rotation` on a feature branch. No existing decision at that slug.

Reasoning: Step 1 passes. Branch precheck returns `proceed` (feature branch is fine). Step 3 yields the top 3 recent RFCs. The drafter returns `mode: "draft_ready"` with `draft_text`, but the Q&A skimmed the consequences section and the drafter left `## Consequences` as a single line `TBD`. Write the file. The quorum runs: `sk-coherence-checker` passes (no contradiction), but `sk-structural-checker` returns `verdict: "fail"` with one issue: `{ "field": "section.## Consequences", "issue": "empty body (placeholder)" }`. Collapse the issues list into prose: `"sk-structural-checker reports section.## Consequences empty body (placeholder)"`. Re-dispatch the drafter with that as `feedback`. The drafter re-asks one focused question, integrates the answer, and returns updated `draft_text` with the Consequences section populated. Write the updated text back through the same path. The quorum now passes (both checkers). Show to the user; user confirms. Commit lands.

Output:

```markdown
# /sk-decide — auth-token-rotation

Mode: explicit-topic
Source: .sidekick/plans/auth-rework/RFC.md

## Validation

Validation quorum (structural + coherence): PASS
Drafter re-dispatches: 1/3

## Result

Wrote .sidekick/decisions/auth-token-rotation.md
Commit: 9bd4f2a decide: capture auth-token-rotation
```

</examples>

<symbol_conventions>

- `<topic>` — explicit positional argument; a kebab-case slug seed. The drafter derives the final slug.
- `<slug>` — kebab-case + lowercase form derived from the drafter's `draft_path` basename; the filename component of `.sidekick/decisions/<slug>.md`.
- `rfc_hint_paths` — top 3 most-recently-committed `.sidekick/plans/*/RFC.md` files, passed to the drafter as input.
- `feedback` — prose summary passed back to the drafter on re-dispatch. Sourced from structural-checker issues (Step 7) or user edit instructions (Step 8).

</symbol_conventions>
