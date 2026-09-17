---
name: sk-build
description: "Execute the work RFC's `## Tasks` wave-by-wave. Computes execution waves via `sidekick wave-plan` (dependency + file-overlap order), then per wave: dispatches sk-executor sequentially, runs gates FRESH, dispatches sk-spec-reviewer in parallel, commits each verified task atomically in T-NN order, and batches any deviations for one routing pass. Writes sequential; verification parallel."
user-invocable: true
disable-model-invocation: true
argument-hint: <issue>
allowed-tools: Read, Edit, Write, Bash, Agent, Grep, Glob
---

You orchestrate task-by-task execution of an existing work RFC. Validate inputs, run a branch precheck, then compute waves and walk them in dependency order: dispatch `sk-executor` per `[ ]` item, run the verification gate FRESH from main session, dispatch `sk-spec-reviewer`, handle any surfaced deviation via the Q1 routing contract, and commit each verified step atomically.

This slash command runs in the user's main session because Claude Code's runtime forbids subagents from dispatching other subagents (per `.claude/rules/sk-agent-prompts.md` "Where orchestrators must live"). Orchestration shape: validate inputs → branch precheck → compute waves (`wave-plan`) → loop { re-read the work RFC's `## Checklist` → find next wave → dispatch sk-executor per task (sequential) → verification gate FRESH → sk-spec-reviewer (parallel within wave) → handle deviation OR commit atomically → loop } → exit on `all_tasks_complete`.

M3 executes wave-by-wave. A **wave** is a set of tasks whose dependencies are all satisfied by earlier waves (computed by `sidekick wave-plan`). Within a wave, writes are **sequential** (the orchestrator commits one task at a time in T-NN order, so atomic commit attribution stays trivial); the `sk-spec-reviewer` verification fan-out runs in **parallel**, capped by `.sidekick/config.json` `waveSizeCap`. Worktree-parallel *writes* are an M4 concern — the per-wave executor dispatch (Step 4) is deliberately isolated as a **seam** so a worktree-isolated backend can replace it without changing the surrounding loop.

<constraints>

- The orchestrator does not modify source files itself. Source writes happen exclusively through the dispatched `sk-executor`, and only after the verification gate runs FRESH from main session.
- Run the verification gate FRESH from main session (typecheck + lint + tests + `sk-spec-reviewer`). Subagent output is a claim, not a fact (see § 2 — verification gate independence) — never substitute `sk-executor`'s `gate_summary` for the orchestrator's own gate run.
- Classify every surfaced deviation through the `classify-deviation` CLI (`<dispatcher_contracts>` § 1) — the heuristics are deterministic, not a judgment call. On `verdict: "mismatch"`, surface BOTH prompts with a `⚠` note rather than routing to the subagent's claimed type.
- Only the explicit `deviation` field in `sk-executor`'s JSON deliverable triggers deviation routing. Prose, test counts, and file paths are never scanned for implicit deviation signals.
- Writes go to `.sidekick/work/<issue>-<slug>/RFC.md` only. The `## Checklist` tick lands in the same atomic commit as the executor's source changes; the `## Amendments` append lands when the user picks `amend` — both inside that one file. Frozen sections (`## Goals`, `## Decisions`, `## Architecture`) stay byte-equal pre/post.

</constraints>

<reasoning>

Externalise key decisions in prose before acting:

- Which task is next: re-read the work RFC's `## Checklist` after each commit; pick first `[ ]` in document order (H3 subsections like `### Core` / `### Polish` are organisational, not boundary-marking).
- The deviation route on a surfaced deviation: pipe the executor's `deviation` block to `classify-deviation`; the helper returns `proceed`/`mismatch` + the route. (This is computed, not judged — the externalised reasoning is just which prompt to render.)
- The gate-failure retry decision: first failure → capture context + re-dispatch sk-executor once with the failure context appended; second failure on the same task → hard-stop.
- Whether the user's routing verb (`amend` / `redesign` / `skip` / `decide` / `pause`) is unambiguous; on freeform replies, keyword-match the first verb and treat the rest as the argument; if genuinely ambiguous, ask one clarifying question rather than guessing.

This reasoning is internal scratchwork — it shapes dispatches, parses, and commits but does not appear inside the work RFC or commit messages.

</reasoning>

<inputs>

User invokes `/sk-build <issue>`.

| Arg | Required | Example |
|---|---|---|
| `<issue>` | yes | `42` — must point to an existing `.sidekick/work/<issue>-<slug>/RFC.md` |

M1 ships only the positional issue number. Flag axes (autonomous mode, parallelisation, commit-skipping) and per-task selection (e.g. jumping to a specific checklist item) are not supported in M1. If a user passes an unrecognised arg, surface a one-line note in the terminal output and continue with the default behaviour.

</inputs>

<hard_stops>

Emit only the structured-error block (no preamble, no progress narration, no sign-off) for any of:

- `error: missing_inputs` — `<issue>` arg absent.
- `error: missing_rfc` — `.sidekick/work/<issue>-<slug>/RFC.md` missing or empty.
- `error: empty_checklist` — RFC.md has no `## Checklist` section, or the section has zero items.
- `error: all_tasks_complete` — every checklist item is now `[x]`. Informational; not a failure. Use the success-exit shape below.
- `error: ambiguous_git_state` — the `branch-precheck` CLI verdict is `hard_stop`. Surface the helper's `hard_stop_message` verbatim. Reachable reasons for `--operation build`: `mid_rebase`, `mid_merge`, `mid_cherry-pick`, `mid_bisect`, `detached_head`, `diverged_from_remote`, `cannot_determine_default_branch`.
- `error: gate_failed_twice` — the verification gate failed on the same task across two `sk-executor` dispatches.
- `error: subagent_failed` — `sk-executor` or `sk-spec-reviewer`'s deliverable is malformed (missing required keys, JSON parse failure, missing `deviation` block when `status === "deviation"`, or `deviation` block present but incomplete — any of `type` / `description` / `d_nn_affected` / `goal_change` missing or wrong type).
- `error: invalid_plan_graph` — `wave-plan` returned `dep_cycle` / `dangling_dep` / `no_tasks`. Surface the helper's `reason`.
- `error: ambiguous_work_dir` — `wave-plan` returned `ambiguous_work_dir`: more than one `.sidekick/work/<issue>-*` directory matches this issue. Surface the helper's `reason`; the fix is to remove one, not add another.

Harvest ritual (bench-5): when a dispatched specialist fails for real — `subagent_failed`, a `gate_failed_twice` whose cause was the executor's own doing, a spec-review verdict later shown wrong — log it at the moment you see it, one command: `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" harvest log --subject agent:<name> --summary "<what went wrong>" --expected "<…>" --actual "<…>" --input "<fixture-able input>"`. The entry becomes an eval case at adjudication; capture cost stays near zero or it won't happen.
- `error: gates_unconfigured` — the `gates` CLI reports `configured: false` (resolved in Step 4 before the first executor dispatch). Name the `missing` gates and the fix (set `gates.*` in `.sidekick/config.json`, or re-run `sidekick init`). The harness never guesses a runner — an unconfigured gate halts rather than silently running a wrong command.

Hard-stop format:

```
/sk-build halted.

error: <code>
Reason: <one-line description>
```

`all_tasks_complete` success-exit shape:

```
/sk-build complete.

error: all_tasks_complete
Reason: All [ ] items in .sidekick/work/<issue>-<slug>/RFC.md ## Checklist are now [x].
```

User-declined `confirm_action` clean-exit shape (Step 2; not an error):

```
/sk-build cancelled.

Reason: User declined to proceed on default branch.
```

Hard-stops emit only the canonical block — no earlier progress narration, no later sign-off.

</hard_stops>

<workflow>

The orchestration loops over the work RFC's `## Tasks` until all `## Checklist` items are `[x]`. The loop body has 7 steps (plus Step 7b for wave checkpointing); deviations are batched per wave and resolved in Step 6 before any wave-advance.

### Step 1 — Validate inputs

Confirm `<issue>` is present. Confirm `.sidekick/work/<issue>-<slug>/RFC.md` exists and is non-empty and contains a `## Checklist` section with at least one `[ ]` or `[x]` item. Hard-stop with the appropriate `error:` code if any check fails.

**Recovery (missing/stale state).** If `.sidekick/state/<issue>/build.json` is absent or its `waves` disagree with a fresh `wave-plan` run, reconstruct from authority before executing: derive the done-set from the `## Checklist`'s `[x]` boxes, cross-checked against `[T-NN]` scopes in `git log --grep` on the current branch. On disagreement, **git wins** and the discrepancy is surfaced. Then show the user: `reconstructed: <N>/<M> tasks done, resuming at wave <K>; <P> uncommitted changes in working tree` and **wait for confirmation** before proceeding. Uncommitted working-tree changes from an interrupted wave are not trusted (unverified by definition) — surface them (`git status --short`); the user decides keep/discard. Only after confirmation, rebuild `build.json` and continue at the first incomplete wave.

### Step 2 — Branch precheck

Run the `branch-precheck` CLI:

```bash
"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" branch-precheck --operation build --ticket-id <issue>
```

Parse the JSON object on stdout (the `--ticket-id` is optional). The helper can return these verdicts:

- `verdict: proceed` — continue silently.
- `verdict: confirm_action` — the helper is asking the user to confirm before proceeding. Surface the helper's advisory text (or a short summary including the `reason`) and ask the user whether to proceed. Reachable reason for `--operation build`: `on_default_for_build` (the user invoked `/sk-build` while on the default branch). If the user confirms, continue. If the user declines, emit the user-declined clean-exit shape (see `<hard_stops>`) and stop — this is a normal cancellation, not an error.
- `verdict: propose_branch` — unreachable for `--operation build` per the helper's policy. If somehow surfaced, treat it as a malformed precheck result and emit `error: ambiguous_git_state`.
- `verdict: hard_stop` — emit `error: ambiguous_git_state` and halt; surface the helper's `hard_stop_message` verbatim. Reachable reasons for `--operation build`: `mid_rebase`, `mid_merge`, `mid_cherry-pick`, `mid_bisect`, `detached_head`, `diverged_from_remote`, `cannot_determine_default_branch`. If the CLI exits non-zero or stdout is unparseable, emit `error: ambiguous_git_state` with the `error`/stderr text.

### Step 3 — Compute waves, find the next incomplete wave

Run `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" wave-plan <issue> --format=json` and parse the JSON. On `verdict: "planned"`, you get `waves` (an ordered array of `T-NN` arrays) — this is the single source of truth for execution order; do not infer order from document order. On `verdict: "dep_cycle"` / `"dangling_dep"` / `"no_tasks"`, hard-stop with `error: invalid_plan_graph` (surface the helper's `reason`). On `missing_rfc`, hard-stop `error: missing_rfc`. On `ambiguous_work_dir`, hard-stop `error: ambiguous_work_dir` (surface the helper's `reason`; the fix is to remove one directory, not add another).

Re-read `.sidekick/work/<issue>-<slug>/RFC.md` for the current `[x]` state. The **next wave** is the first wave (in order) that contains at least one `[ ]` task. Tasks in that wave already `[x]` are skipped (already built). If every task in every wave is `[x]`, emit the `all_tasks_complete` clean-exit block.

`wave-plan`'s `warnings` (e.g. file-overlap serialization) are surfaced once, on the first wave computation, as a one-line note.

### Step 4 — Execute the wave (executor dispatch seam)

Before the run's first dispatch, resolve the gates once: run `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" gates` (Bash) and parse the JSON. On `configured: false`, hard-stop `error: gates_unconfigured` naming `missing`. The resolved `gates` values feed both the executor dispatches and the FRESH gate — one resolution, so the two cannot diverge.

For each `[ ]` task in the current wave, **in T-NN order, one at a time** (sequential writes — M3): capture that task's **baseline** first — the repo-relative paths already dirty in the working tree, from one `git status --porcelain=v1` Bash call — then dispatch `subagent_type: sk-executor` with the input fields from `<dispatcher_contracts>` § 3 (`task_id`, `task_description`, `files_changed` parsed from the task's `**Files:**` bullets, `goal_ids`, `decision_ids`, `rfc_path`, `gate_commands` from the resolved gates). After each executor returns, run the verification gate FRESH for that task (Step 5) before dispatching the next task's executor. The baseline feeds the scope gate (Step 5): a wave's clean tasks aren't committed until Step 6, so an earlier same-wave task's writes are still uncommitted when a later task runs — subtracting the baseline keeps them from being misattributed.

> **Seam (M4):** this sequential per-task dispatch is the single point a worktree-isolated parallel backend replaces. Everything downstream (gate, commit, deviation batching) consumes the same per-task executor deliverables regardless of how they were produced. Do not couple commit/deviation logic to sequential ordering beyond "commit clean tasks in T-NN order."

**Verification fan-out (parallel).** The `sk-spec-reviewer` dispatches for the wave's tasks MAY run in parallel — dispatch up to `waveSizeCap` (`.sidekick/config.json`, default 4) `sk-spec-reviewer` `Agent` calls in one message, then collect. (Typecheck/lint/test gates run per task via Bash as today.) This is the only parallelism in M3.

### Step 5 — Verification gate FRESH

The gate runs from main session via direct Bash invocations and a parallel `sk-spec-reviewer` dispatch. `sk-executor`'s `gate_summary` is a claim; the FRESH run is the source of truth (see `<dispatcher_contracts>` § 2 — verification gate independence).

| Tier | Gate | Tool |
|---|---|---|
| 1 | Typecheck | resolved `gates.typecheck` (Step 4's `sidekick gates` resolution) |
| 1 | Lint | resolved `gates.lint` |
| 1 | Tests | resolved `gates.test` + `<changed-files-glob>` |
| 1 | Scope | `sidekick scope-check` (declared `**Files:**` vs actual writes) |
| 2 | Spec-reviewer | `sk-spec-reviewer` subagent dispatch |

**Tests-tier soft-pass.** If `sk-executor`'s `gate_summary.tests.result === "no_tests_in_scope"` (no `*.test.*` path in `files_changed` AND no sibling test file on disk for any non-test path in `files_changed`), the orchestrator soft-passes the tests tier — no test-gate invocation; emit `(no tests in scope for T-NN)` to the gate-context output. Typecheck, lint, and spec-reviewer run regardless.

**Spec-reviewer dispatch.** Pass `task_id`, `task_description`, `diff` (the task's uncommitted working-tree diff, scoped to its change set — e.g. `git diff -- <paths>` over `scope-check`'s `actual` set, baseline-subtracted — or a `diff_command` for the reviewer to run), `goal_ids`, `decision_ids`, `rfc_path`. Parse the trailing ```json``` fence for the `verdict` field. Nothing is staged at this point — staging happens at Step 6/7 from the scope-verified actual set.

**Scope gate.** Run `scope-check` for the just-executed task, passing its Step-4 baseline and the executor's returned `files_changed` as `--reported`:

```bash
"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" scope-check --issue <issue> --task <T-NN> --baseline <csv> --reported <csv>
```

It scores the task's declared `**Files:**` scope against the actual working-tree changes (baseline subtracted) — the one gate the executor's self-report cannot stand in for, since a write the executor omits from `files_changed` is invisible to the self-report but not to git. On `verdict: "clean"`, proceed; a non-empty `unreported` or `reported_unchanged` is surfaced as a one-line note in the gate-context output, never a failure (the reported-set deltas are informational). `verdict: "out_of_scope"` is a tier-1 gate failure whose failure context is the `out_of_scope` list plus the instruction to revert those writes or return `status: "deviation"` with a rationale; it feeds the same single re-dispatch as the other tiers. If the task is still `out_of_scope` after that re-dispatch, route it into the wave's deviation batch (Step 6) as a scope deviation for the user — unlike a twice-failed typecheck/lint/test, it does not `gate_failed_twice`.

**Gate failure handling:**

- First failure on this task (any tier-1 stderr exit, or `sk-spec-reviewer` `verdict: "fail"`, or `sk-executor` `status: "failed"`): capture the failing tier's stderr or the reviewer's `reasoning` verbatim; re-dispatch `sk-executor` once with the failure context appended to the prompt body.
- Second failure on the same task: emit `error: gate_failed_twice` and halt; surface the failing gate output to the user.

`sk-executor`'s internal 3-attempt fix budget restarts on each fresh dispatch; the orchestrator's own retry budget is 1.

### Step 6 — Resolve the wave (commit clean tasks, batch deviations)

A wave runs to completion before resolving deviations — its tasks are dependency-independent, so a deviation in one never blocks its siblings.

1. **Commit clean tasks.** For each wave task whose executor returned `status: "passed"` AND whose FRESH gate passed (Step 5), commit it atomically in **T-NN order** (Step 7) — staging the scope-verified **actual** change set (from `scope-check`, baseline subtracted) + the `## Checklist`'s `[ ]`→`[x]` tick for that task **in the same commit**.
2. **Collect deviations.** Gather every wave task with `status: "deviation"` (or a twice-failed gate routed as a deviation) into one batch. For each, validate Q1 heuristics (`<dispatcher_contracts>` § 1) and record the routing context to `.sidekick/state/<issue>/build.json` (the build-state cache — see `<build_state>`).
3. **Surface the batch.** If the batch is non-empty, render each deviation's routing prompt (`<routing_prompts>`) under a single heading `Wave N — M deviation(s) to route`, in T-NN order. Pause for the user.
4. **Apply each routing verb** (`amend` / `redesign` / `skip` / `decide` / `pause`) as defined in `<routing_prompts>`. `redesign`/`decide`/`pause` exit cleanly (the wave's clean tasks are already committed in step 1). `amend`/`skip` commit and continue.
5. **Advance.** Once the batch is resolved (and no exit-verb fired), loop to Step 3 to recompute the next incomplete wave. A task routed `redesign`/`pause` leaves its downstream dependents `[ ]`; they surface naturally on the next wave computation.

The verb actions themselves (`amend` appends an A-NN block to RFC.md + commits; `skip` ticks + commits; `redesign`/`decide`/`pause` exit cleanly with the rerun hint / `git status --short`) are unchanged — see `<routing_prompts>` and `<output_artifacts>`.

### Step 7 — Atomic commit (no deviation, gate passed)

Stage the scope-verified **actual** change set (`scope-check`'s `actual`, baseline subtracted) + the `## Checklist` tick (`[ ]` → `[x]` on the executed T-NN) — staging the actual set rather than the executor's self-reported `files_changed` closes the lingering-unreported-write hole: a write the executor omitted from its report still gets committed and gated, not left dirty in the working tree. Commit atomically with Conventional Commits format:

```
<scope>(<area>): <one-line summary> [T-NN]

<body, optional>
```

`<scope>` ∈ `feat` / `fix` / `refactor` / `tooling` / `docs`. `<area>` reflects the subsystem touched (e.g. `lib`, `auth`, `editor`). Pull `<one-line summary>` from the task description's verb-and-object phrase.

After commit, print terminal feedback `✓ T-NN — committed <sha>` and loop to Step 3.

### Step 7b — Wave checkpoint (governed by `buildCheckpoints`)

After a wave's clean tasks are committed and any deviations resolved, behavior depends on `.sidekick/config.json` `buildCheckpoints` (default `deviations-only`):

- `deviations-only` — **narrate and continue**: print `wave N done: committed T-03, T-04; next: wave N+1 (T-05, T-06)` and loop to Step 3 without pausing. (Deviations already paused in Step 6.)
- `per-wave` — narrate, then **pause** for the user's OK before computing the next wave (`continue` / `inspect` / `abort`).
- `autonomous` — narrate only on errors; loop without pausing on clean waves.

The narration line is also written to `build.json`'s `next_action` (see `<build_state>`).

</workflow>

<dispatcher_contracts>

Four load-bearing contracts the orchestration depends on. Each describes the parse semantics for one subagent or one independent verification step.

### 1. Deviation classification reconciliation (Q1 contract)

**Why it exists.** `sk-executor`'s self-classification is the spec, but trusting one party's classification papers over real disagreement. Surface signaled disagreement explicitly rather than silently routing.

**The classification is deterministic — compute it, don't judge it.** Pipe the executor's `deviation` block to the CLI:

```bash
echo '<deviation-json>' | "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" classify-deviation
```

It returns `{ verdict, route, signal }`. `verdict: "proceed"` → render the prompt for `route` (`amendment` → amendment prompt; `redesign` → redesign prompt; `decision` → `/sk-decide` suggestion). `verdict: "mismatch"` (the executor claimed `amendment` but the signal — ≥2 D-NN affected, or `goal_change`, or a >150-word description — warrants a redesign) → render the `⚠` note above BOTH prompts. The thresholds live in the helper, not here.

**Mismatch surface form** (prepended above the amendment prompt):

```
⚠ Subagent classified as amendment, but <N> D-NN affected (<list>).
   This typically warrants a redesign loop — see redesign prompt below.

[amendment prompt rendered here]

[redesign prompt rendered here]
```

User reads both, picks any verb. The concrete user verbs (`amend`, `redesign`, `skip`, `decide`, `pause`) are unchanged on mismatch; the orchestrator routes the chosen verb to the matching action.

### 2. Verification gate independence (the subagent-output-is-a-claim contract)

**Why it exists.** Subagent output is a claim, not a fact. Subagents can fail silently in many ways: token-limit truncation, "claimed done but file missing", network errors, hangs. The orchestrator's job is independent verification.

**Steps after subagent return:**

1. Parse the deliverable JSON. If malformed, hard-stop with `error: subagent_failed`.
2. Run the resolved `gates.typecheck` (Step 4's `sidekick gates` resolution — never a guessed runner) via Bash. Capture stderr on failure.
3. Run the resolved `gates.lint` via Bash. Capture stderr on failure.
4. Run the resolved `gates.test` + `<changed-files-glob>` via Bash unless the tests-tier soft-pass predicate fires. Capture stderr on failure.
5. Run `scope-check` (declared `**Files:**` vs the actual working-tree changes, baseline subtracted) — the orchestrator-side check the executor's self-reported `files_changed` structurally cannot satisfy, since an omitted write is invisible to the self-report but not to git. `verdict: "out_of_scope"` is a gate failure (see Step 5 — Scope gate).
6. Dispatch `sk-spec-reviewer`. Capture `reasoning` if `verdict === "fail"`.
7. If any tier fails: capture failure context, re-dispatch `sk-executor` ONCE with the failure context appended to the prompt body. The orchestrator runs the gate FRESH again on the next return.
8. If the second dispatch fails a deterministic tier or the spec-reviewer on the same task: emit `error: gate_failed_twice` and halt. (A persistent `out_of_scope` verdict is the exception — it routes into the wave's deviation batch per Step 5's Scope gate, not a hard-stop.)

The orchestrator runs the gate from scratch regardless of what the deliverable claims. `status: "passed"` is informational, not a substitute for the gate.

**Worked example.**

Subagent return: `{ "status": "passed", "files_changed": ["src/lib/foo.ts"], "notes": "tests pass locally" }`.

Internal reasoning (not emitted): subagent claims pass, but the verification-gate-independence contract says verify independently. Run the resolved `gates.typecheck` → exit code 1, stderr names a `TS2322` mismatch in `src/lib/foo.ts`. Tier-1 gate failed; capture context; re-dispatch `sk-executor` with the failure context. If the second attempt also fails, hard-stop with `error: gate_failed_twice`.

### 3. sk-executor dispatch

**Input fields** (passed in the prompt body, YAML-ish):

| Field | Required | Source | Notes |
|---|---|---|---|
| `task_id` | yes | Picked item from the work RFC's `## Checklist` | e.g. `T-04` |
| `task_description` | yes | Verbatim from the work RFC's `## Checklist` | Source of truth for intent |
| `files_changed` | yes | the work RFC's per-task `**Files:**` bullets | Bounds the writable scope; out-of-scope edits surface via deviation |
| `goal_ids` | optional | `[g_n, ...]` annotation prefix | Context only |
| `decision_ids` | optional | `[D-NN, ...]` annotation prefix | Context only |
| `rfc_path` | optional | `.sidekick/work/<issue>-<slug>/RFC.md` | For resolving cited IDs |
| `gate_commands` | yes | Step 4's `sidekick gates` resolution | The orchestrator resolves and passes them; neither side guesses a runner |

**Deliverable shape** (ONE JSON object inside a final ```json``` fence):

```json
{
  "status": "passed" | "deviation" | "failed",
  "files_changed": ["..."],
  "gate_summary": {
    "typecheck": { "result": "pass" | "fail", "output": "..." },
    "lint":      { "result": "pass" | "fail", "output": "..." },
    "tests":     { "result": "pass" | "fail" | "no_tests_in_scope", "output": "..." }
  },
  "fix_attempts": 0,
  "deviation": {
    "type": "amendment" | "redesign" | "decision_opportunity",
    "description": "...",
    "d_nn_affected": ["D-NN"],
    "goal_change": false
  },
  "notes": "..."
}
```

`deviation` is present iff `status === "deviation"` and absent otherwise. `notes` is optional. `fix_attempts` is an integer in `[0, 3]`.

**Parse semantics:**

- `status === "passed"` → proceed to Step 5 (gate FRESH). `gate_summary` is informational.
- `status === "deviation"` → branch to Step 6. Parse `deviation`; validate Q1 heuristics per § 1.
- `status === "failed"` → `sk-executor` exhausted its 3-attempt internal fix budget. Treat as the orchestrator's first gate failure: re-dispatch once with the failing tier's `output` appended as context. On second failure: `error: gate_failed_twice`.

**Diagnostic fields:**

- `gate_summary.tests.result === "no_tests_in_scope"` informs the orchestrator's tests-tier soft-pass (Step 5).
- `fix_attempts > 0` is diagnostic context useful for reading commit logs later.

### 4. sk-spec-reviewer dispatch

**Input fields** (passed in the prompt body, YAML-ish):

| Field | Required | Source | Notes |
|---|---|---|---|
| `task_id` | yes | Same as Executor | Citation in `reasoning` |
| `task_description` | yes | Verbatim from the work RFC's `## Checklist` | Source of truth for intent |
| `diff` | yes | Inline OR `diff_command` | The task's uncommitted working-tree diff (scope-verified `actual` set, baseline-subtracted) |
| `goal_ids` | optional | Same as Executor | Cross-reference into RFC.md |
| `decision_ids` | optional | Same as Executor | Cross-reference into RFC.md |
| `rfc_path` | optional | Same as Executor | For resolving cited IDs |

The reviewer receives the task description (spec) and the `diff` read fresh from git (artifact) — never `sk-executor`'s `notes`, `gate_summary`, or deliverable. That seal keeps the verification independent of the producer (Rule 5); the executor's output flows the *other* way (its `reasoning` feeds a re-dispatch on failure), never into the reviewer's input. Preserve this on any future edit.

**Deliverable shape:**

```json
{ "verdict": "pass" | "fail", "reasoning": "..." }
```

inside a final ```json``` fence. `reasoning` is a non-empty string ≤200 words.

**Parse semantics:**

- `verdict === "pass"` → continue to Step 7 (atomic commit). The orchestrator does not regex over `reasoning`.
- `verdict === "fail"` → treat as a verification-gate failure. Capture `reasoning` verbatim into the failure-context block fed to `sk-executor` on the orchestrator's retry.

`sk-spec-reviewer` does not re-run typecheck/lint/tests (those passed before the dispatch) and does not goal-verify (a separate concern). Its scope is diff-vs-task-description only.

</dispatcher_contracts>

<build_state>

`/sk-build` maintains `.sidekick/state/<issue>/build.json` — a **gitignored, per-developer cache** of build progress. It is NOT authority: it is fully reconstructable from the `## Checklist`'s `[x]` boxes + `[T-NN]` git commit scopes (see Recovery in Step 1). Create `.sidekick/state/<issue>/` if absent. `.sidekick/state/` (and `.sidekick/cache/`) are already gitignored by `sidekick init` — if the entries are somehow missing (the repo was never initialised), surface a one-line note suggesting `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" init` rather than editing `.gitignore` mid-build.

Shape:

```json
{
  "issue": "<issue>",
  "waves": [["T-01"], ["T-02", "T-03"]],
  "current_wave": 1,
  "tasks": { "T-01": "done", "T-02": "pending", "T-03": "deviation" },
  "deviations": [
    { "task": "T-03", "type": "amendment", "routed": "pending", "summary": "..." }
  ],
  "next_action": "wave 2: T-02, T-03"
}
```

Write it after each wave resolution (Step 6 / Step 7b). `tasks` values: `pending` | `done` | `deviation` | `skipped`. Treat write failures as non-fatal (warn and continue — it is a cache, not authority).

</build_state>

<routing_prompts>

Rendered prompts shown to the user when `sk-executor` returns `status: "deviation"`. Pre-fill template fields from the deviation block + invocation context.

### Amendment prompt

Rendered when heuristics validate cleanly to `amendment` (1 D-NN + `goal_change === false` + description ≤150 words). Pre-fill `<T-NN>` from the executed task; pre-fill the body fields from the subagent's `description`.

```
/sk-build paused at <T-NN>.

Implementation introduces a deviation from RFC.md:

  Design said:  <quote or summary of original design intent>
  Discovered:   <what was actually found>
  Proposed:     <what to do about it>

Classify:
  /sk-build amend "<rationale>"   → append A-NN to RFC.md, continue
  /sk-design <issue>              → loop back, redesign approach
  /sk-build skip                  → continue without recording
  /sk-decide <topic>              → record as system rule first
  /sk-build pause                 → halt for thinking
```

### Redesign prompt

Rendered when heuristics validate to `redesign` (subagent said `redesign`, OR mismatch flagged). Pre-fill `<D-NN(s) affected>` from `d_nn_affected[]`; populate `Options surfaced:` from the subagent's options if surfaced (otherwise emit a placeholder `(a) <option from description>`); the `Recommended:` line is `/sk-design <issue>` with the invocation's issue number. After the redesign lands, the user re-invokes `/sk-build <issue>` to resume.

```
/sk-build paused at <T-NN>.

Implementation hit a structural blocker:

  Design said:  <original D-NN(s) affected>
  Discovered:   <what was actually found>
  Impact:       <N locked decisions affected; approach restructure required>

Options surfaced:
  (a) <option 1 + tradeoffs>
  (b) <option 2 + tradeoffs>
  (c) <option 3 + tradeoffs>

This is bigger than an amendment.

Classify:
  /sk-build amend       → not appropriate (multiple D's affected)
  /sk-design <issue>    → loop back, redesign approach (RECOMMENDED)
  /sk-build skip        → not safe (tests will fail)
  /sk-build pause       → halt for thinking

After /sk-design <issue> completes, re-invoke /sk-build <issue> to resume
through the revised tasks.
```

The `Recommended:` line is concrete and ready to paste — the user copies-and-runs it in their next message. Slash commands cannot dispatch other slash commands.

### Verb-routing keyword match

Users may type the verb in slightly varied form (`amend "X"` / `/sk-build amend "X"` / `amend X`). Match the verb by the first keyword (`amend` / `redesign` / `skip` / `decide` / `pause`); the rest of the line is treated as the rationale or topic argument. If the verb is genuinely ambiguous, ask one clarifying question rather than guessing.

</routing_prompts>

<output_artifacts>

```
src/                          (modified by sk-executor, gated by FRESH verification)
.sidekick/work/<issue>-<slug>/
└─ RFC.md                     (## Checklist tick T-NN [x] + ## Amendments A-NN append — same file, same commit)
```

### Commit shape (default)

```
<scope>(<area>): <one-line summary> [T-NN]

<One-line phase summary.>

What ships:
- <bullet>
- <bullet>

Spec changes:
- <bullet>

Tests:
- <bullet>
```

**Commit body convention.** Multi-file or multi-concern commits use structured groups + bullets for scannability. Group names are situational (`What ships`, `Spec changes`, `Decisions locked`, `Tests`, etc.); choose what fits the change. Trivial single-file commits may use a one-line body.

Examples:

- `feat(lib): add formatTaskId helper [T-01]`
- `fix(cache): handle empty advancedRule in compiled-rule lookup [T-12]`
- `refactor(lib): extract format helpers into shared module [T-02]`
- `tooling(skills): add /sk-build orchestrator [T-03]`

**Worked example — soft-pass `Tests:` line.** When the Step 5 tests-tier soft-pass fires (`sk-executor`'s tests-in-scope predicate yielded `no_tests_in_scope`), the commit body gains a `Tests:` group line so the soft-pass is visible in the log without digging into the diff. The line renders only when soft-pass fired. Example body for a source-only T-NN that didn't ship tests in scope:

```
feat(lib): add formatTaskId helper [T-01]

Add a small helper for rendering task IDs.

What ships:
- src/lib/format-task-id.ts

Tests: no tests in scope for T-01
```

### A-NN block (rendered only when user picks `amend`)

Append to RFC.md `## Amendments`. If the section doesn't exist, create it after `## Decisions` (or at end of doc if `## Decisions` is absent).

```markdown
## Amendments

### A-NN (T-MM, YYYY-MM-DD)

**Affected:** D-XX[, D-YY...]

**Rationale:** <user-supplied rationale from the amend verb argument>

**Description:** <subagent's deviation.description verbatim>
```

`A-NN` increments per amendment within the ticket's RFC.md (A-01 first, then A-02). `T-MM` references the executing task. Date is ISO `YYYY-MM-DD` from system clock.

### What is NOT auto-edited

Frozen sections — `## Goals & non-goals`, `## Architecture`, `## Decisions`, `## Research notes` — are not auto-edited by `/sk-build`. If the amendment requires re-wording an existing decision, that is a user action — the user edits RFC.md manually, then continues `/sk-build`. Auto-editing frozen sections corrupts the design narrative.

</output_artifacts>

<examples>

Three worked examples: a happy path, a redesign-with-mismatch, and a mixed wave (clean task + amendment).

### Example 1 — Happy path with 3 tasks, all pass

User invokes `/sk-build 29`. The work RFC lists 3 tasks (T-01, T-02, T-03) in its `## Tasks` section implementing a small `format-task-id` utility module.

Internal reasoning (not emitted): inputs validate; the `branch-precheck` CLI returns `proceed`; the work RFC's `## Checklist` re-read shows T-01 as next. Dispatch `sk-executor` for T-01. Executor returns `{ status: "passed", files_changed: ["src/lib/format-task-id.ts", "src/lib/format-task-id.test.ts"], gate_summary: { ... all pass ... }, fix_attempts: 0 }`. No `deviation` field — proceed to gate FRESH.

Run typecheck → pass. Run lint → pass. Run tests on the changed files → pass. `scope-check` → `clean` (the two writes match T-01's `**Files:**`). Dispatch `sk-spec-reviewer` → `{ verdict: "pass", reasoning: "Diff adds formatTaskId(n) at the named path; implementation matches T-01's intent." }`. Stage the scope-verified actual set + the `## Checklist` tick. Commit: `feat(lib): add formatTaskId helper [T-01]`. Print `✓ T-01 — committed <sha>`. Loop.

T-02 and T-03 follow the same pattern. After T-03's commit, the work RFC's `## Checklist` re-read shows all `[x]`. Emit the `all_tasks_complete` clean-exit block.

Output: 3 atomic commits + clean exit. No routing prompts fired.

### Example 2 — Redesign suggested, mismatch flagged, user pauses

User invokes `/sk-build 37`. T-01 dispatched. Executor returns:

```json
{
  "status": "deviation",
  "files_changed": [],
  "deviation": {
    "type": "amendment",
    "description": "Implementing pure ISO 8601 formatting requires re-implementing leap-year, month-length, and zero-padding logic across multiple modules. Three locked decisions (D-01, D-02, D-04) all hinge on the assumption that the platform's date library is available; reverting that assumption changes which modules own which behaviour and what the input contract for recordEvent() looks like.",
    "d_nn_affected": ["D-01", "D-02", "D-04"],
    "goal_change": true
  },
  "gate_summary": { "typecheck": { "result": "fail", "output": "<truncated>" }, "lint": { "result": "pass", "output": "" }, "tests": { "result": "no_tests_in_scope", "output": "" } },
  "fix_attempts": 0
}
```

Internal reasoning (not emitted): pipe T-01's `deviation` block to `classify-deviation` → `verdict: "mismatch"` (claimed amendment, but 3 D-NN affected and `goal_change`). Surface the `⚠` note and render BOTH prompts.

Output (rendered to user):

```
⚠ Subagent classified as amendment, but 3 D-NN affected (D-01, D-02, D-04).
   This typically warrants a redesign loop — see redesign prompt below.

/sk-build paused at T-01.

Implementation introduces a deviation from RFC.md:

  Design said:  D-01, D-02, D-04 — date formatting via platform library
  Discovered:   Pure ISO 8601 implementation crosses module boundaries
  Proposed:     Re-implement leap-year + month-length + padding from scratch

Classify:
  /sk-build amend "<rationale>"   → append A-NN to RFC.md, continue
  /sk-design 37                   → loop back, redesign approach
  /sk-build skip                  → continue without recording
  /sk-decide <topic>              → record as system rule first
  /sk-build pause                 → halt for thinking

/sk-build paused at T-01.

Implementation hit a structural blocker:

  Design said:  D-01, D-02, D-04 — date formatting via platform library
  Discovered:   Pure ISO 8601 implementation crosses module boundaries
  Impact:       3 locked decisions affected; approach restructure required

Options surfaced:
  (a) <option from description>

This is bigger than an amendment.

Classify:
  /sk-build amend             → not appropriate (multiple D's affected)
  /sk-design 37               → loop back, redesign approach (RECOMMENDED)
  /sk-build skip              → not safe (tests will fail)
  /sk-build pause             → halt for thinking

After /sk-design 37 completes, re-invoke /sk-build 37 to resume
through the revised tasks.
```

User responds: `/sk-build pause`.

Internal reasoning (not emitted): user picked pause. Exit cleanly. No commit. The executor's `files_changed` was empty; if it had been non-empty, surface `git status --short` so the user can choose to stash or discard.

Output: zero new commits + clean exit.

### Example 3 — a wave with one clean task and one deviation

User invokes `/sk-build 42`. Wave 2 contains T-03 and T-04 (dependency-independent — both depend only on T-01 and T-02, which are already `[x]`).

**Step 4 — Executor dispatches (sequential).** Dispatch `sk-executor` for T-03. Executor returns:

```json
{
  "status": "passed",
  "files_changed": ["src/lib/keyboard-registry.ts", "src/lib/keyboard-registry.test.ts"],
  "gate_summary": {
    "typecheck": { "result": "pass", "output": "" },
    "lint":      { "result": "pass", "output": "" },
    "tests":     { "result": "pass", "output": "" }
  },
  "fix_attempts": 0
}
```

Dispatch `sk-executor` for T-04. Executor returns:

```json
{
  "status": "deviation",
  "files_changed": ["src/lib/keyboard-handler.ts"],
  "gate_summary": {
    "typecheck": { "result": "pass", "output": "" },
    "lint":      { "result": "pass", "output": "" },
    "tests":     { "result": "pass", "output": "" }
  },
  "fix_attempts": 0,
  "deviation": {
    "type": "amendment",
    "description": "KeyboardEvent.key is read-only in the target browser environment; synthetic key injection requires a wrapper type. D-03 assumes direct event mutation is available.",
    "d_nn_affected": ["D-03"],
    "goal_change": false
  }
}
```

**Step 5 — Verification gate FRESH (T-03).** Run typecheck → pass. Run lint → pass. Run tests → pass. `scope-check` → `clean`. Dispatch `sk-spec-reviewer` for T-03 → `{ "verdict": "pass", "reasoning": "Diff adds KeyboardRegistry class at the named path; all T-03 acceptance criteria met." }`.

Internal reasoning (not emitted): T-03 is clean (gate passed). T-04 has a deviation — collect it for batching. Pipe T-04's `deviation` block to `classify-deviation` → `verdict: "proceed"`, route `amendment` (1 D-NN, no goal change, short description). No mismatch.

**Step 6 — Resolve wave 2.**

Step 1 (commit clean tasks): Stage `src/lib/keyboard-registry.ts`, `src/lib/keyboard-registry.test.ts`, and the `## Checklist`'s T-03 tick. Commit: `feat(lib): add KeyboardRegistry [T-03]`. Print `✓ T-03 — committed <sha>`.

Step 2 (collect deviations): One deviation — T-04. Q1 heuristics validated above; routing context recorded to `.sidekick/state/42/build.json`.

Step 3 (surface the batch):

```
Wave 2 — 1 deviation to route

/sk-build paused at T-04.

Implementation introduces a deviation from RFC.md:

  Design said:  D-03 — direct KeyboardEvent mutation for synthetic key injection
  Discovered:   KeyboardEvent.key is read-only; direct mutation unavailable
  Proposed:     Introduce a wrapper type for synthetic events

Classify:
  /sk-build amend "<rationale>"   → append A-NN to RFC.md, continue
  /sk-design 42                     → loop back, redesign approach
  /sk-build skip                  → continue without recording
  /sk-decide <topic>              → record as system rule first
  /sk-build pause                 → halt for thinking
```

User responds: `amend "KeyboardEvent.key is spec-frozen; wrapper type is the correct abstraction"`.

Step 4 (apply verb — amend): A-NN counter for this RFC.md is currently 0 → A-01. Append A-01 to `## Amendments`. Stage `src/lib/keyboard-handler.ts` + the work RFC's A-01 amendment + `## Checklist` T-04 tick. Commit: `feat(lib): wrap synthetic KeyboardEvent in handler [T-04]`. Print `✓ T-04 — committed <sha>`.

Step 5 (advance): batch resolved, no exit-verb fired. Loop to Step 3.

**Step 7b — Wave 2 checkpoint.** `buildCheckpoints` is `deviations-only` (default). Print `wave 2 done: committed T-03, T-04; next: wave 3 (T-05, T-06)`. Loop without pausing.

Output: 2 atomic commits (T-03 clean, T-04 with A-01 amendment), clean advance to wave 3.

</examples>

<symbol_conventions>

- `T-NN` — task ID (zero-padded). Stable within a ticket; never reused.
- `D-NN` — decision ID in RFC.md `## Decisions`. Stable; referenced from amendments and redesigns.
- `A-NN` — amendment ID in RFC.md `## Amendments`. Counter per ticket; A-01 first.
- `R-NN` — redesign ID in RFC.md `## Redesigns`. Owned by `/sk-design`; `/sk-build` does not write to `## Redesigns` — it defers via the redesign prompt's `Recommended:` line.
- `<issue>` — the positional argument identifying the work directory (`.sidekick/work/<issue>-<slug>/`); `<slug>` is the directory's readable label, not independently resolvable.
- `⚠` — mismatch flag prepended to the amendment prompt when the subagent's classification disagrees with heuristics.

</symbol_conventions>
