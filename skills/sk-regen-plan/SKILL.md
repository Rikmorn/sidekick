---
name: sk-regen-plan
description: Reconcile PLAN.md's checklist with git history. The reconcile-plan helper does deterministic [T-NN] matching + proposes checkbox flips; sk-plan-reconciler proposes classifications for untagged commits with reasoning; the human accepts or modifies; then PLAN.md is written. --dry-run previews without writing. Branch-precheck hard-stops on the default branch.
user-invocable: true
disable-model-invocation: true
argument-hint: <slug> [--dry-run]
allowed-tools: Read, Grep, Glob, Bash, Agent, Edit
---

You reconcile a plan's `PLAN.md` checklist with what was actually committed. The deterministic part (parse the checklist, match `[T-NN]` tags, propose flips) is done by the `reconcile-plan` helper; the judgment part (what each *untagged* commit represents) is proposed by `sk-plan-reconciler`; you present both to the human, who accepts or modifies, and only then do you write `PLAN.md`.

This runs in the main session. It writes `PLAN.md`, so it gates on git state via `branch-precheck`.

<constraints>
- Write `PLAN.md` only — never source, never the cache. The deterministic flips go through `reconcile-plan --apply`; backfilled tasks for accepted `new` classifications are added via `Edit`.
- Never write without the human's confirmation (except `--dry-run`, which never writes at all).
- `sk-plan-reconciler` proposes; you decide-with-the-human and apply. Don't let its proposals auto-apply.
</constraints>

<reasoning>
Externalise before acting:
- Default branch comes from `.sidekick/config.json` (fallback `main`); pass it to the helper as `--default-branch`.
- The deterministic `proposed_flips` from the helper are safe to apply on acceptance (a tagged commit unambiguously maps to its task). The reconciler's `match-T-NN` proposals are *suggestions* — fold a `match-T-NN` into the flip set only if the human accepts it.
- Accepted `new` classifications become rows under a `## Backfilled tasks` section (create it if absent); `defer`/`ignore` produce no PLAN.md change (optionally noted under `## Deferred`). Preserve all other PLAN.md bytes.
</reasoning>

<inputs>

| Arg | Required | Notes |
|---|---|---|
| `<slug>` | yes | resolves to `.sidekick/plans/<slug>/PLAN.md` |
| `--dry-run` | no | preview the proposed reconciliation; write nothing |

</inputs>

<hard_stops>

- `error: missing_inputs` — no `<slug>`.
- `error: regen_plan_on_default_branch` — `sk-branch-precheck` (operation `regen-plan`) returned `hard_stop` on the default branch (reading `git log` on the integration line mixes merge commits). Surface the helper's message.
- `error: missing_plan` / `error: no_checklist` — the helper returned that verdict.
- `error: subagent_failed` — `sk-plan-reconciler` returned malformed JSON.

Format: `/sk-regen-plan halted.` then `error: <code>` + `Reason:`.
</hard_stops>

<workflow>

### Step 1 — Branch precheck
Dispatch `subagent_type: sk-branch-precheck` with `operation: regen-plan` and `ticket_id: <slug>`. `hard_stop` → `regen_plan_on_default_branch` (surface the message). `proceed` → continue.

### Step 2 — Deterministic analysis
Run `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" reconcile-plan <slug> --default-branch <b> --format=json` (Bash). Parse: `tasks`, `unmapped_commits`, `proposed_flips`. `verdict: missing_plan|no_checklist` → the matching hard-stop.

### Step 3 — Judge untagged commits
If `unmapped_commits` is non-empty, dispatch `subagent_type: sk-plan-reconciler` with `ticket_slug`, `unmapped_commits`, and `tasks`. Parse its `classifications[]`. (Empty unmapped → skip.)

### Step 4 — Human accept/modify gate
Present: the deterministic `proposed_flips` (tasks to tick), and each reconciler classification (commit, proposal, reasoning, confidence). Ask the human to accept the set or modify any item (re-classify, drop, change a `match` target). Surface `low`/`medium` confidence items prominently. If `--dry-run`, render the would-be result and exit (no write).

### Step 5 — Apply
Compute the final flip set = `proposed_flips` + accepted `match-T-NN` task ids. Run `reconcile-plan <slug> --apply <comma-ids>` (writes the checkbox flips). For accepted `new` classifications, `Edit` `PLAN.md` to add rows under `## Backfilled tasks`. Render a confirmation: tasks ticked, tasks backfilled, commits ignored/deferred.

</workflow>
