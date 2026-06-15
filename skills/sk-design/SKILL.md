---
name: sk-design
description: Research-driven design phase. From a topic or slug, dispatches sk-explorer (pre-flight) + conditional research subagents + sk-pattern-mapper + sk-architectural-advisor + sk-rfc-drafter + sk-plan-drafter; verifies each artifact via dimensional reviewers. Writes RFC.md / PLAN.md / RESEARCH.md under .sidekick/plans/<slug>/.
user-invocable: true
disable-model-invocation: true
argument-hint: <topic-or-slug> [--auto <low|medium|high>]
allowed-tools: Read, Grep, Glob, Bash, Agent, WebFetch, WebSearch, Write
---

You orchestrate research-driven design for a single plan. Given a topic-or-slug, you scope the work via `sk-explorer`, optionally dispatch research, gather architectural context and codebase analogues, draft RFC.md, gate it through a structural reviewer + user, draft PLAN.md, gate it through a parallel quorum of dimensional reviewers, and commit the artifacts atomically.

This slash command runs in the main session because the runtime forbids subagents from dispatching other subagents (per `.claude/rules/sk-agent-prompts.md` "Where orchestrators must live"). The orchestration logic lives here; the focused cognitive work lives in the dispatched subagents.

The reviewer pair on PLAN.md is the canonical demonstration of dimensional verification: `sk-structural-checker` checks shape (frontmatter, required headings, checklist well-formedness), and `sk-crossref-checker` checks references (every cited `g_n` / `D-NN` resolves into RFC.md; `pins-rfc:` matches RFC content). Both review the same artifact in parallel; either failing re-dispatches the drafter with combined feedback.

<constraints>

- Writes go only to `.sidekick/plans/<slug>/{RFC.md, PLAN.md, RESEARCH.md}`. When `sk-explorer` returns `group_created`, the group artifacts (`OVERVIEW.md`, `MEMBERS.md` under `.sidekick/plans/<group-slug>/`) are written by `sk-explorer`, not by this skill.
- Source code, branches, and git state are read-only here — the final `git add` + `git commit` is the only mutation outside the plan directory.
- Respect `sk-explorer`'s scoping verdict without second-guessing it. `proceed` continues; `group_created` exits cleanly; `hard_stop` halts.
- Honour `sk-branch-precheck`'s verdict. A `hard_stop` verdict halts the flow with the helper's message surfaced verbatim.
- The Step 12 quorum dispatches the two reviewers in parallel — one Agent call per reviewer in one message — so each reviewer reasons independently before the orchestrator combines verdicts. A serialised dispatch lets one reviewer's output influence the other through intermediate context and defeats the purpose of having two dimensions.

</constraints>

<reasoning>

Externalise key decisions in prose before acting:

- Interpreting `sk-explorer`'s mode: `proceed` continues with the returned `slug` / `scope_statement` / `complexity` / `research_hints`; `group_created` exits cleanly and surfaces the explorer's `continuation` field; `hard_stop` emits the matching error code.
- The research decision: explicit flag overrides complexity heuristics. `--no-research` skips research even on `high` complexity; `--research` forces research even on `low`. Without a flag, `low` skips and `medium` / `high` run. When research is skipped, the synthesiser dispatch (Step 5) is skipped too.
- How to combine the Step 12 quorum verdicts: both pass → continue; either failing → roll up the failing reviewer(s)' `issues` into a single prose `feedback` field for the plan-drafter re-dispatch. If both fail, concatenate both checkers' issues; if only one fails, include only that checker's issues (don't carry the passing checker's empty `issues` field through).
- Whether to surface `sk-branch-precheck`'s `confirm_action` or `propose_branch` advisory to the user. `confirm_action` (e.g., on-default-branch policy) offers two meaningful choices — confirm to proceed, or cancel to clean-exit. `propose_branch` offers three: create the suggested branch and re-invoke (clean-exit with the branch-name hint, since `/sk-design` is artifact-only and the user owns git), proceed in place on the current branch (continue silently), or cancel (clean-exit). The natural reading of "no" to a branch suggestion is "proceed in place," so always surface that option explicitly rather than collapsing decline into cancel.
- When a reviewer fails and the re-dispatch loop is approaching its cap (3 drafter calls), the right move is to halt with the loop-exhausted error and let the user retry; shipping a malformed artifact is worse than a clean halt.
- During the Step 9 user-review turn, edits surface as a `feedback` re-dispatch to `sk-rfc-drafter`. There is no cap on Step 9 because the user drives — they decide when the RFC is good enough. If the user explicitly cancels at any turn of the review loop, emit the cancelled clean-exit shape with a reason naming the cancellation, leave the draft artifacts on disk (no commit, no cleanup), and exit.

The reasoning is internal scratchwork shaping dispatches and writes; it does not appear in the committed artifacts.

</reasoning>

<inputs>

User invokes `/sk-design <topic-or-slug> [--auto <low|medium|high>]`.

| Arg | Required | Notes |
|---|---|---|
| `<topic-or-slug>` | yes | A clean slug like `add-keyboard-shortcuts`, a nested group slug like `multi-tenant/auth`, or freeform text like `"add cmd+k to the admin UI"`. `sk-explorer` classifies and routes. |
| `--auto <low|medium|high>` | no | Hands-off mode at the stated effort. Absent → collaborative exploration (the default). `low` ≈ minimal research; `medium` ≈ standard; `high` ≈ deep + adversarial verification. Effort defaults to `.sidekick/config.json` `fanout.budget` (mapped) when `--auto` is given with no level. |

The removed flags (`--research`, `--no-research`, `--budget`) error clearly if passed — surface `unknown flag <name>; see --auto` rather than silently ignoring them. Research is no longer a flag: in exploration it is a request inside the conversation; in `--auto` the effort level sets it. Effort `low|medium|high` maps onto the existing `quick|standard|deep` budget tiers behind `<fanout_seam>`.

</inputs>

<hard_stops>

Emit only the structured-error block (no preamble, no progress narration, no sign-off) for any of:

- `error: missing_inputs` — `<topic-or-slug>` arg absent.
- `error: slug_collision` — `sk-explorer` returned `hard_stop` with `reason: slug_collision` (a plan with this slug already exists at `.sidekick/plans/<slug>/`).
- `error: user_rejected_slug` — `sk-explorer` returned `hard_stop` with `reason: user_rejected_slug` (the user declined every slug suggestion during Q&A).
- `error: cannot_classify` — `sk-explorer` returned `hard_stop` with `reason: cannot_classify` (insufficient information after Q&A to set complexity).
- `error: ambiguous_git_state` — `sk-branch-precheck` returned `verdict: hard_stop`. Surface the helper's `hard_stop_message` verbatim.
- `error: missing_architecture_context` — `sk-architectural-advisor`'s structured return surfaced `error: missing_architecture_context`. The consuming repo has no CLAUDE.md or `.claude/rules/` — the advisor cannot ground recommendations in repo constraints. Surface to the user with a hint to author a minimal CLAUDE.md before re-running `/sk-design`.
- `error: rfc_structural_check_loop_exhausted` — Step 8's drafter ↔ structural-checker loop hit its 3-dispatch cap without a `pass` verdict.
- `error: plan_quorum_check_loop_exhausted` — Step 12's drafter ↔ quorum loop hit its 3-dispatch cap without both reviewers passing.
- `error: research_failed` — `--research` was set and a researcher returned a hard error (`no_canonical_sources_found` or other). When research was triggered by complexity heuristics rather than the flag, the orchestrator drops the failing researcher and continues with the remaining set instead of halting.
- `error: subagent_failed` — any dispatched subagent returned malformed JSON, an unrecognised `mode` / `verdict`, or a deliverable that fails its documented contract.

Hard-stop format:

```
/sk-design halted.

error: <code>
Reason: <one-line description>
```

Clean-exit shapes (no `error:` prefix):

```
/sk-design — group scope detected.

<sk-explorer.continuation field>
```

```
/sk-design cancelled.

Reason: <one-line user-facing description (e.g., "User declined the branch advisory.", "User cancelled during RFC review.")>
```

```
✓ <slug> — designed (RFC.md, PLAN.md{, RESEARCH.md})
```

</hard_stops>

<workflow>

Thirteen steps. Steps 4 and 12 dispatch in parallel — one Agent call per specialist in one message. Steps 8 and 12 loop on reviewer feedback (capped); Step 9 loops on user feedback (uncapped).

### Step 1 — Dispatch sk-explorer

Dispatch `subagent_type: sk-explorer` with `topic_or_slug` and `repo_root`. Parse the trailing ```json``` fence. Branch on `mode`:

- `proceed` — capture `slug`, `scope_statement`, `complexity`, `research_hints`. Continue to Step 2.
- `group_created` — emit the clean-exit "group scope detected" block surfacing the explorer's `continuation` text. No further work.
- `hard_stop` — emit the matching error block (`slug_collision` / `user_rejected_slug` / `cannot_classify`) surfacing the explorer's `reason`. Halt.

### Step 2 — Branch precheck

Dispatch `subagent_type: sk-branch-precheck` with `operation: design` and `ticket_id: <slug>`. Parse the agent's structured-return block.

- `verdict: proceed` — continue silently.
- `verdict: confirm_action` — surface the advisory text (or short summary of `reason`); ask the user to pick one of three options:
  - (a) **Confirm and proceed** — continue silently with the workflow.
  - (b) **Cancel** — emit the user-declined clean-exit shape and halt.
  - (For `confirm_action`, "accept" and "confirm" are functionally the same — both continue.)
- `verdict: propose_branch` — surface the helper's `proposed_branch` advisory and ask the user to pick one of three options:
  - (a) **Create branch and re-invoke** — clean-exit with the suggested branch name as a hint (no git commands run; `/sk-design` is artifact-only and the user owns branch operations).
  - (b) **Proceed in place** — continue silently with the workflow on the current branch.
  - (c) **Cancel** — clean-exit with the cancelled shape.
- `verdict: hard_stop` — emit `error: ambiguous_git_state` and surface the helper's `hard_stop_message` verbatim. Halt.

### Step 3 — Decide whether to run research

Combine the explorer's `complexity` with the flag overrides:

| Flag | Complexity | Decision |
|---|---|---|
| `--no-research` | (any) | Skip research |
| `--research` | (any) | Run research |
| (none) | `low` | Skip research |
| (none) | `medium` or `high` | Run research |

When research is skipped, note it in reasoning prose so Step 5 (the synthesiser dispatch) is also skipped.

The budget tier never changes WHETHER research runs — only how wide the fan-out is and how much verification it gets (see `<fanout_seam>`).

### Step 4 — Parallel dispatch: design context

In a single message, dispatch the design-context specialists. Each is a separate Agent call so they run concurrently:

- `subagent_type: sk-pattern-mapper` with `intent: <scope_statement>`, `files: [<best-guess paths from scope>]` tagged `(new)` or `(modify)`, `scope: ui|infra|mixed` (best-guess from the scope statement). The drafter refines later — a coarse guess at this stage is fine.
- `subagent_type: sk-architectural-advisor` with `topic: <slug>`, `rfc_context: <scope_statement>`, `scope_hint: <ui|infra|mixed>`. If the advisor's structured-return block surfaces `Recommendation: error` with `Off-stack rejection: (none) — error: missing_architecture_context`, hard-stop with `error: missing_architecture_context` (see `<hard_stops>`). Reserve `error: subagent_failed` for genuinely malformed advisor output (e.g., the `## Architecture` heading is absent, or the `### Structured return` block is missing required fields).
- When research is going to run, ALSO dispatch researchers **through the fan-out seam** (see `<fanout_seam>`), in the same parallel batch as the baseline pair when the backend is `agents`. The budget tier picks how many: `quick` dispatches one researcher for the first entry in `research_hints[]`; `standard` and `deep` dispatch one per entry. Each hint maps to `sk-researcher-<hint>` (`impl` / `decision` / `context`). Pass `type: <hint>`, `question: <specific question derived from the scope statement>`, `cap_words: 800`, `sources_required: true` — identical fields regardless of backend.

Wait for all dispatches to return, then move to Step 5.

### Step 5 — Synthesise research

Skip this step entirely when research was skipped at Step 3.

Before dispatching the synthesiser, pre-filter `per_agent_outputs[]`:

- Drop any entry whose `output` is empty (token-limit truncation, silent failure, etc.). The synthesiser hard-stops with `empty_agent_output` if it receives even one such entry, so the orchestrator must filter rather than forward.
- Apply the same rule as `no_canonical_sources_found`: if `--research` was set AND any researcher returned empty `output`, hard-stop with `error: research_failed`. If research was triggered by complexity heuristics (not the flag), drop the entry and continue with the remaining set; note the dropped researcher in reasoning.
- Apply the equivalent for `error: no_canonical_sources_found`: with `--research` set, hard-stop with `error: research_failed`; otherwise drop and continue.

Dispatch `subagent_type: sk-research-synthesiser` with:

- `topic: <slug>`
- `per_agent_outputs: [{ name, output, sources_cited, duration_ms }]` — the filtered subset
- `synthesis_target: "recommendation"`
- `cap_words_short: 200`
- `cap_words_full: 2000`

Parse the trailing ```json``` fence; extract `short_synthesis` and `full_synthesis`.

Write `full_synthesis` directly to `.sidekick/plans/<slug>/RESEARCH.md` so it lives on disk before the RFC drafter runs. Hold `short_synthesis` for inclusion in the drafter's input — it lands in RFC.md `## Research notes` via the drafter, not via direct write.

### Step 6 — Dispatch sk-rfc-drafter

Dispatch `subagent_type: sk-rfc-drafter` with:

- `slug`, `scope_statement`, `complexity`
- `synthesis_output: <full synthesiser JSON>` when research ran; omit when it didn't
- `architecture_section: <advisor's "## Architecture" body, parsed per the dispatcher_parse_contracts>`
- `analogues: [{ path, why_relevant }]` extracted from `sk-pattern-mapper`'s report (see `<dispatcher_parse_contracts>` for the parse semantics)

Parse the trailing ```json``` fence; extract `draft_text` from the `draft_ready` deliverable.

### Step 7 — Write RFC.md

Write `draft_text` to `.sidekick/plans/<slug>/RFC.md`, creating parent directories as needed.

### Step 8 — Verify RFC structure

Dispatch `subagent_type: sk-structural-checker` with `artifact_path: .sidekick/plans/<slug>/RFC.md` and `artifact_type: "rfc"`. Parse the trailing ```json``` fence.

- `verdict: pass` — continue to Step 9.
- `verdict: fail` — re-dispatch `sk-rfc-drafter` with `feedback: <issues collapsed into a prose summary the drafter can act on>`. Write the updated `draft_text` through to RFC.md. Re-run the structural check.
- Cap at 3 drafter re-dispatches. On the third failure, emit `error: rfc_structural_check_loop_exhausted` and halt.

### Step 9 — User review

Show the RFC.md path and contents to the user; ask for confirmation, edits, or cancellation.

- On confirm, continue to Step 10.
- On edits, re-dispatch `sk-rfc-drafter` with `feedback: <user edit instructions as prose>`. Write the updated `draft_text` through. Re-run Step 8's structural check before re-surfacing. Loop until the user confirms — there is no cap because the user drives the loop.
- On user cancel (the user explicitly cancels with "cancel" or similar), emit the cancelled clean-exit shape with `Reason: User cancelled during RFC review.` Do not commit. Leave RFC.md and RESEARCH.md on disk as drafts (the user may want to resume manually). No error code — this is a clean exit. The same pattern applies on any later turn of the user-review loop.

### Step 10 — Dispatch sk-plan-drafter

Compute the RFC content hash via `git hash-object .sidekick/plans/<slug>/RFC.md`. Capture stdout as `rfc_hash`.

Dispatch `subagent_type: sk-plan-drafter` with `slug`, `rfc_path: .sidekick/plans/<slug>/RFC.md`, and `rfc_hash`. Parse the trailing ```json``` fence; extract `draft_text` from the `draft_ready` deliverable.

### Step 11 — Write PLAN.md

Write `draft_text` to `.sidekick/plans/<slug>/PLAN.md`.

### Step 12 — Quorum verify PLAN.md

In a single message, dispatch both reviewers in parallel:

- `subagent_type: sk-structural-checker` with `artifact_path: .sidekick/plans/<slug>/PLAN.md`, `artifact_type: "plan"`.
- `subagent_type: sk-crossref-checker` with `artifact_path: .sidekick/plans/<slug>/PLAN.md`, `artifact_type: "plan"`, `related_paths: { rfc: .sidekick/plans/<slug>/RFC.md }`.

Parse both ```json``` fences. Combine verdicts:

- Both `verdict: pass` — continue to Step 13.
- Either `verdict: fail` — re-dispatch `sk-plan-drafter` with `feedback: <failing reviewer(s)' issues collapsed into a single prose summary the drafter can act on>`. Before the re-dispatch, if any failing crossref issue has `kind: "pins_rfc_drift"`, re-compute `rfc_hash` via `git hash-object .sidekick/plans/<slug>/RFC.md` and pass the fresh value — the user may have edited RFC.md between Step 10 and Step 12. Without the re-compute, the drafter receives the stale hash and the loop cannot recover (it would re-emit the same drift on every retry until the cap exhausts). Write the updated `draft_text` through to PLAN.md. Re-run the quorum.
- Cap at 3 drafter re-dispatches. On the third failure, emit `error: plan_quorum_check_loop_exhausted` and halt.

Verifier independence is the load-bearing property: the parallel dispatch keeps the two checkers' reasoning from contaminating each other via the orchestrator's intermediate state. A serialised dispatch (structural first, then crossref) defeats the dimensional separation.

### Step 13 — Atomic commit

Stage `.sidekick/plans/<slug>/RFC.md`, `.sidekick/plans/<slug>/PLAN.md`, and `.sidekick/plans/<slug>/RESEARCH.md` (the last only when it exists). Commit with Conventional Commits format:

```
design(<slug>): draft RFC and PLAN
```

After commit, print the success block (`✓ <slug> — designed (RFC.md, PLAN.md{, RESEARCH.md})`) and exit cleanly.

</workflow>

<fanout_seam>

The research fan-out runs through a backend seam so the orchestration logic stays backend-agnostic (ADR-0002 §3). Everything downstream of dispatch — synthesis, drafting, review — consumes the same researcher deliverables regardless of how they were produced.

**Resolution.** Read `fanout` from `.sidekick/config.json` (absent → `{ backend: "auto", budget: "standard" }`). A `--budget` flag overrides the configured budget for this invocation.

- `backend: agents` — dispatch researchers as parallel `Agent` calls in the main session (the default path; always works).
- `backend: workflow` — compose the researcher fan-out as one Workflow run: each researcher is an `agent()` call with `agentType: "sk-researcher-<hint>"` and the same input fields; collect the structured returns when the run completes.
- `backend: auto` — run the probe via Bash: `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" capabilities`. Parse the JSON; `workflows.available === "likely"` → use the workflow backend, anything else → agents. If the probe itself fails, use agents.

**Budget tiers** (the tier gates verification depth and researcher count, not just cost):

| Tier | Researchers | Verification |
|---|---|---|
| `quick` | first hint only | none beyond the synthesiser pass |
| `standard` | one per hint, parallel | synthesiser merge (current default behaviour) |
| `deep` | one per hint + adversarial cross-check of load-bearing claims | requires the workflow backend; with agents, fall back to `standard` and note the downgrade in reasoning prose |

`deep` is explicit opt-in (config or flag) — never escalate to it on your own judgment; it is a token-cost decision that belongs to the operator.

**Failure semantics.** The workflow backend failing for any reason (tool unavailable, disabled, launch error) is never a hard-stop: fall back to the agents backend and note the fallback in reasoning prose. Plan-level gating is not detectable up front — the fallback IS the degradation path (see `docs/LIMITS.md` in the sidekick repo).

**Observability (until E21 lands).** Record one line in RESEARCH.md's header when research ran: `fanout: backend=<agents|workflow>, budget=<tier>` — plus the run's token total when the workflow backend was used (visible in `/workflows`).

</fanout_seam>

<dispatcher_parse_contracts>

Ten contracts, one per dispatched specialist. Each describes the input fields, the deliverable shape, and the parse semantics. All JSON deliverables come inside a final ```json``` fence — the parse extracts that fence and ignores reasoning prose surrounding it.

### 1. sk-explorer

**Input:** `{ topic_or_slug, repo_root }`.

**Output modes** (one JSON object inside a ```json``` fence):

- `{ mode: "proceed", slug, scope_statement, complexity, research_hints }` — scoping succeeded; continue to Step 2.
- `{ mode: "group_created", group_slug, first_member_slug, continuation }` — input spans multiple plans; explorer wrote `OVERVIEW.md` + `MEMBERS.md` under `.sidekick/plans/<group-slug>/`; orchestrator clean-exits with the `continuation` hint.
- `{ mode: "hard_stop", reason }` — `reason` is one of `slug_collision`, `user_rejected_slug`, `cannot_classify`; orchestrator emits the matching error code.

The explorer is the only entry point for scoping. Its verdict is final — the orchestrator does not re-scope.

### 2. sk-branch-precheck

**Input:** `{ operation: "design", ticket_id: <slug> }`.

**Output** (structured-return block): `verdict` is one of `proceed`, `confirm_action`, `propose_branch`, `hard_stop`. For `--operation design`, all four verdicts are reachable.

- `proceed` — continue silently.
- `confirm_action` — surface the advisory (or a summary of `reason`); pause for the user to either confirm (continue) or cancel (clean-exit). Two options only — accept and confirm are functionally the same.
- `propose_branch` — surface `proposed_branch` with three options: (a) create the branch and re-invoke (clean-exit with the branch name as a hint), (b) proceed in place on the current branch (continue), (c) cancel (clean-exit). "Proceed in place" is the natural reading of declining the branch suggestion; surface it as a distinct option rather than folding it into cancel.
- `hard_stop` — emit `error: ambiguous_git_state` with `hard_stop_message` surfaced verbatim.

### 3. sk-pattern-mapper

**Input:** `{ intent: <scope_statement>, files: [{ path, status: "new"|"modify" }], scope: "ui"|"infra"|"mixed" }`.

**Output:** markdown report (NOT JSON-fenced — the agent emits markdown directly). Parse two regions:

- The trailing structured-return summary block: `PATTERN MAPPING COMPLETE` line, `Files classified: N`, `Analogues: matched/total ...`, `Top shared patterns: ...`, `Notable gaps: ...`. Used to detect malformed returns (missing block → `error: subagent_failed`).
- The `## Per-file Pattern Assignments` H2 section. For each per-file entry of the form `### \`<path>\` (new — role, flow)` or `### \`<path>\` (modify — role, flow)`, extract `{ path: <path>, why_relevant: <role + analogue summary from the entry body> }`. This list becomes the `analogues` field passed into `sk-rfc-drafter`.

### 4. sk-architectural-advisor

**Input:** `{ topic: <slug>, rfc_context: <scope_statement>, scope_hint: "ui"|"infra"|"mixed" }`.

**Output:** markdown body starting with `## Architecture` (not JSON-fenced — the agent emits markdown directly). Parse from the first `^## Architecture\s*$` line to end-of-output and pass the whole slice verbatim into `sk-rfc-drafter` as `architecture_section`. Any preamble before the heading is permitted by the advisor's contract and discarded on parse.

**Routing:**

- Missing `## Architecture` heading, or `### Structured return` block missing required fields → `error: subagent_failed` (programmer-error path).
- `### Structured return` surfaces `Recommendation: error` with `Off-stack rejection: (none) — error: missing_architecture_context` → hard-stop with `error: missing_architecture_context`. Surface the advisor's reason (no CLAUDE.md / `.claude/rules/` constraint sources) so the user knows to author a minimal CLAUDE.md before re-running.
- Otherwise — pass the parsed `## Architecture` slice through to `sk-rfc-drafter`.

### 5. sk-researcher-{impl,decision,context}

**Input:** `{ type: "impl"|"decision"|"context", question, cap_words: 800, sources_required: true }`.

**Output:** `{ name, output, sources_cited, duration_ms }` inside a ```json``` fence, or an error JSON of the form `{ error: "no_canonical_sources_found", reason }`.

**Routing:**

- Success — append to `per_agent_outputs[]` for the synthesiser.
- `no_canonical_sources_found` AND `--research` was set — hard-stop with `error: research_failed`.
- `no_canonical_sources_found` AND research was triggered by complexity heuristics — log a warning in reasoning, drop the failing researcher, continue with the remaining set.
- Any other malformed shape — `error: subagent_failed`.

### 6. sk-research-synthesiser

**Input:** `{ topic, per_agent_outputs: [{ name, output, sources_cited, duration_ms }], synthesis_target: "recommendation", cap_words_short: 200, cap_words_full: 2000 }`.

**Output:** `{ short_synthesis, full_synthesis }` inside a ```json``` fence (both non-empty markdown strings).

**Routing:** write `full_synthesis` to `.sidekick/plans/<slug>/RESEARCH.md`; pass the whole synthesiser JSON to `sk-rfc-drafter` as `synthesis_output`. The drafter selects which parts of `synthesis_output` to embed in RFC.md `## Research notes`.

**Pre-dispatch contract:** the orchestrator pre-filters `per_agent_outputs[]` at Step 5 to drop entries with empty `output` before dispatching. The synthesiser's `empty_agent_output` hard-stop should therefore never fire in practice — if it does, treat as `error: subagent_failed` (programmer-error path: the pre-filter missed an entry).

### 7. sk-rfc-drafter

**Input:** `{ slug, scope_statement, complexity, synthesis_output?, architecture_section, analogues: [{ path, why_relevant }], feedback? }`.

**Output:** `{ mode: "draft_ready", draft_path, draft_text }` inside a ```json``` fence, or an error JSON of the form `{ error: "missing_input"|"invalid_complexity", reason }`.

**Routing:** write `draft_text` to `.sidekick/plans/<slug>/RFC.md`. On a re-dispatch with `feedback`, the drafter integrates the targeted section only and leaves every other section byte-equal.

### 8. sk-plan-drafter

**Input:** `{ slug, rfc_path, rfc_hash, feedback? }`.

**Output:** `{ mode: "draft_ready", draft_path, draft_text }` inside a ```json``` fence, or an error JSON.

**Routing:** write `draft_text` to `.sidekick/plans/<slug>/PLAN.md`. The drafter is responsible for embedding `pins-rfc: <rfc_hash>` in the PLAN.md frontmatter — the crossref-checker verifies the pin at Step 12.

### 9. sk-structural-checker

**Input:** `{ artifact_path, artifact_type: "rfc"|"plan"|"decision" }`.

**Output:** `{ verdict: "pass"|"fail", artifact_path, artifact_type, issues? }` inside a ```json``` fence. `issues` is REQUIRED iff `verdict === "fail"` and ABSENT otherwise.

**Routing:** `pass` continues; `fail` rolls `issues` into a prose `feedback` field for the matching drafter's re-dispatch.

### 10. sk-crossref-checker

**Input:** `{ artifact_path, artifact_type: "plan"|"decision", related_paths: { rfc: <abs path> } }`.

**Output:** `{ verdict: "pass"|"fail", artifact_path, artifact_type, issues? }` inside a ```json``` fence.

**Routing:** same shape as `sk-structural-checker`. At Step 12, the two checkers' failures are combined into a single prose `feedback` summary so the plan-drafter sees both dimensions in one re-dispatch.

</dispatcher_parse_contracts>

<output_artifacts>

```
.sidekick/plans/<slug>/
├─ RFC.md         (YAML frontmatter + Goals & non-goals, Architecture, Decisions, Questions, Risks, optional Research notes)
├─ PLAN.md        (YAML frontmatter with pins-rfc: <rfc_hash> + per-task entries + ## Checklist)
└─ RESEARCH.md    (full synthesiser narrative — only when research ran)
```

`<slug>` may be a flat slug (`add-keyboard-shortcuts`) or a nested member-of-group slug (`multi-tenant/auth`). The explorer's `proceed` mode returns the canonical form.

### Commit shape

```
design(<slug>): draft RFC and PLAN
```

Single atomic commit. Stage only the paths written by this skill — `git add .sidekick/plans/<slug>/RFC.md .sidekick/plans/<slug>/PLAN.md` plus `RESEARCH.md` when it exists. Never `git add -A`.

### What is NOT written by this skill

- `OVERVIEW.md` / `MEMBERS.md` (written by `sk-explorer` when it returns `group_created`).
- Amendment or redesign blocks in RFC.md (those are written by downstream skills during execution).
- Source code (touched only by `/sk-build` via `sk-executor`).
- `.sidekick/decisions/*.md` (owned by `/sk-decide`).

</output_artifacts>

<examples>

Three worked examples covering happy path with no research, the parallel-research path with two reviewer re-dispatches, and the group-scope clean-exit.

### Example 1 — Happy path, low complexity, no research

User invokes `/sk-design rename-add-to-sum`.

Internal reasoning (not emitted): clean slug, no flags. Dispatch `sk-explorer`; it returns `{ mode: "proceed", slug: "rename-add-to-sum", scope_statement: "Rename the helper currently named `add` to `sum` across the lib and update call sites.", complexity: "low", research_hints: [] }`. Continue.

Step 2: dispatch `sk-branch-precheck`; verdict `proceed` (working on a feature branch already). Continue silently.

Step 3: complexity `low`, no `--research` flag — skip research. Steps 4 dispatches only `sk-pattern-mapper` and `sk-architectural-advisor` in parallel (two Agent calls in one message). No researchers. Step 5 skipped because no `per_agent_outputs` to synthesise.

Pattern-mapper returns a markdown report with `## Per-file Pattern Assignments` listing the existing `src/lib/math.ts` and `src/lib/math.test.ts` as the analogues. Parse the per-file H3s into `analogues: [{ path: "src/lib/math.ts", why_relevant: "utility — same module being renamed; rename is a refactor within this file" }, { path: "src/lib/math.test.ts", why_relevant: "test — colocated tests that need their imports updated" }]`. Advisor returns a 3-paragraph preamble followed by `## Architecture` and the body. Slice from `## Architecture` onwards; discard preamble.

Step 6: dispatch `sk-rfc-drafter` with `slug`, `scope_statement`, `complexity: "low"`, `architecture_section`, `analogues`. No `synthesis_output`. Drafter returns `{ mode: "draft_ready", draft_path: ".sidekick/plans/rename-add-to-sum/RFC.md", draft_text: "<markdown>" }`.

Step 7: write RFC.md. Step 8: dispatch `sk-structural-checker` with `artifact_type: "rfc"`; verdict `pass`. Step 9: surface RFC.md to the user; user replies "looks good". Continue.

Step 10: compute `rfc_hash` via `git hash-object`; dispatch `sk-plan-drafter`. Returns `draft_text` with two tasks (T-01 rename in `src/lib/math.ts`, T-02 update tests). Step 11: write PLAN.md.

Step 12: dispatch `sk-structural-checker` AND `sk-crossref-checker` in parallel (two Agent calls in one message). Structural verdict `pass`; crossref verdict `pass` (each cited `g_n` resolves; `pins-rfc:` matches the computed hash). Continue.

Step 13: stage `RFC.md` + `PLAN.md` (no `RESEARCH.md` written); commit `design(rename-add-to-sum): draft RFC and PLAN`. Print the success block. Exit.

### Example 2 — Research path with parallel quorum re-dispatch

User invokes `/sk-design realtime-presence "Add live cursor presence to the editor for collaborative sessions"`.

Internal reasoning (not emitted): freeform text. Dispatch `sk-explorer`; it runs Q&A (4 questions about overlay surface, session model, latency budget, prior art), the user confirms a suggested slug, and returns `{ mode: "proceed", slug: "realtime-presence", scope_statement: "Add live cursor presence to the collaborative editor; one cursor per active session; ≤300ms perceived latency.", complexity: "high", research_hints: ["impl", "decision", "context"] }`.

Step 2: branch precheck — verdict `proceed`. Step 3: complexity `high`, no flag override — run research.

Step 4 (parallel): five Agent calls in one message — `sk-pattern-mapper`, `sk-architectural-advisor`, `sk-researcher-impl` (presence-library survey), `sk-researcher-decision` (transport choice: WebSocket vs SSE vs WebRTC), `sk-researcher-context` (CRDT presence patterns, citations). All five return; researchers all report non-empty `output` with `sources_cited`.

Step 5: dispatch `sk-research-synthesiser` with the three researcher outputs, `synthesis_target: "recommendation"`. Returns `{ short_synthesis, full_synthesis }`. Write `full_synthesis` directly to `.sidekick/plans/realtime-presence/RESEARCH.md`.

Step 6: dispatch `sk-rfc-drafter` with `synthesis_output` (the synthesiser's full JSON), `architecture_section`, `analogues`. Drafter returns `draft_text`.

Step 7: write RFC.md. Step 8: `sk-structural-checker` returns `verdict: "fail"`, `issues: [{ field: "section.## Risks", issue: "empty body" }]` — the drafter left a placeholder. Re-dispatch `sk-rfc-drafter` with `feedback: "## Risks section body is empty; populate from the synthesis's risk subsection."`. New `draft_text`; write through; re-check; verdict `pass`. Continue to Step 9. User confirms.

Step 10–11: compute `rfc_hash`; dispatch `sk-plan-drafter`; write PLAN.md.

Step 12 (parallel quorum): two Agent calls in one message — `sk-structural-checker` and `sk-crossref-checker`. Structural verdict `pass`; crossref verdict `fail`, `issues: [{ field: "task.T-04.decisions", issue: "cites D-09 but RFC.md ## Decisions defines D-01..D-04 only — dangling reference" }]`. Combine the two reviewers' issues into prose `feedback: "Crossref check flagged T-04 cites D-09 but the RFC defines D-01..D-04 only. Fix the dangling decision reference."`. Re-dispatch `sk-plan-drafter`. Returns updated `draft_text` (T-04 now cites D-02 instead). Write through; re-run quorum (parallel again). Both pass.

Step 13: stage `RFC.md` + `PLAN.md` + `RESEARCH.md`; commit `design(realtime-presence): draft RFC and PLAN`. Print success block.

The visible behaviour distinguishing this example from Example 1: RESEARCH.md exists; the RFC drafter ran twice (once fresh + one re-dispatch on feedback); the plan-drafter ran twice (once fresh + one re-dispatch with combined quorum feedback). Both reviewer-loop budgets were exercised but neither exhausted.

### Example 3 — Group scope detected, clean exit

User invokes `/sk-design "let's redesign the entire admin UI to support multi-tenant billing"`.

Internal reasoning (not emitted): freeform text. Dispatch `sk-explorer`; it runs Q&A and detects the topic spans multiple distinct surfaces (auth, billing UI, tenant settings, audit log). The explorer writes `.sidekick/plans/multi-tenant/OVERVIEW.md` (group intent + sequencing rationale) and `.sidekick/plans/multi-tenant/MEMBERS.md` (ordered member list with status `pending` for each), then returns `{ mode: "group_created", group_slug: "multi-tenant", first_member_slug: "multi-tenant/auth", continuation: "Run /sk-design multi-tenant/auth" }`.

Orchestrator interprets `group_created` as a clean-exit signal — the explorer has done the scoping work and routed forward. No branch precheck runs (no commit will happen), no research, no drafters. The orchestrator prints the clean-exit "group scope detected" block surfacing the `continuation` text and exits.

This example demonstrates the orchestrator trusting `sk-explorer`'s scoping verdict without second-guessing it. The explorer is the only entry point for scoping; the orchestrator routes on its mode and does not attempt to re-scope a group as a single plan.

</examples>

<symbol_conventions>

- `<slug>` — positional argument identifying the plan directory (`.sidekick/plans/<slug>/`). Flat (`add-keyboard-shortcuts`) or nested member-of-group (`multi-tenant/auth`).
- `<group-slug>` — set by `sk-explorer` when input spans multiple plans. Used for `.sidekick/plans/<group-slug>/OVERVIEW.md` and `MEMBERS.md`. Not written by this skill.
- `g_n` — goal ID in RFC.md `## Goals & non-goals`. Sequentially numbered from `g1`. Cited by PLAN.md tasks and verified by `sk-crossref-checker`.
- `D-NN` — decision ID in RFC.md `## Decisions` (zero-padded from D-01). Cited by PLAN.md tasks and verified by `sk-crossref-checker`. Amendments and redesigns are owned by `/sk-build` and `/sk-design`'s downstream loops respectively — this skill writes only the initial set.
- `T-NN` — task ID in PLAN.md `## Checklist` (zero-padded from T-01). Set by `sk-plan-drafter`; ticked by `/sk-build`.
- `pins-rfc:` — PLAN.md frontmatter field carrying the `git hash-object` of RFC.md at the moment PLAN.md was authored. Set by `sk-plan-drafter`; verified by `sk-crossref-checker` at Step 12; consumed by `/sk-build`'s drift check.

</symbol_conventions>
