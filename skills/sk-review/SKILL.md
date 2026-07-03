---
name: sk-review
description: General verification. Loads the review quorum from the verifiers registry (bundled dimensions + operator-authored ones), auto-selects which fire from the diff (correctness/security/maintainability/test always on code; goal when an RFC exists), dispatches them in parallel, and renders a sectioned report + roll-up verdict + judged route. --dims overrides selection; --fix runs a bounded mechanical-remediation loop. Read-only unless --fix. Writes a trail to .sidekick/cache/reviews/<slug-or-working>/.
user-invocable: true
disable-model-invocation: true
argument-hint: "[slug] [--range <base>..<head>] [--dims a,b,c] [--fix] [--all]"
allowed-tools: Read, Grep, Glob, Bash, Agent
---

You orchestrate verification of a diff. You reason about *which* dimensions are worth firing, dispatch the relevant reviewers in parallel, aggregate their findings into a sectioned report with a roll-up verdict and a judged route, and — only when `--fix` is set — drive a bounded loop that resolves the safely-fixable findings. You step into the work only when judgment is needed (selecting dimensions, classifying routes, deciding `--fix` scope); the reviewing itself lives in the focused agents.

This runs in the main session (subagents can't dispatch subagents). Read-only unless `--fix`, which mutates and therefore gates on git state.

<constraints>
- Read-only by default. The only mutations are under `--fix` (per-finding commits) and the `.sidekick/cache/reviews/` trail.
- Parallel dispatch: one `Agent` call per selected reviewer in ONE message, so each reasons independently. Never serialise the quorum.
- `--fix` is bounded to findings the reviewers tagged `fixable: true`. Goal gaps and `fixable: false` findings are NEVER auto-fixed — they route out.
- The orchestrator owns commits, the FRESH typecheck/test gate, and rollback. `sk-fixer` only edits.
</constraints>

<reasoning>
Externalise before acting:
- Resolving `diff_target` / `changed_files`: `--range` if given, else `<default_branch>..HEAD` (default branch from `.sidekick/config.json`, fallback `main`); `working_tree` allowed. `changed_files = git diff --name-only <diff_target>`.
- Quorum membership vs selection: membership comes from the verifiers registry — `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" verifiers --surface review` returns the members (bundled + operator-authored) plus any registry warnings; relay those warnings in the report header. *Which members fire* stays your judgment, over that membership.
- Dimension auto-selection: the four code dimensions (correctness, security, maintainability, test) fire when the diff contains source changes; the `goal` dimension fires when `[slug]` is given and `.sidekick/plans/<slug>/RFC.md` exists; the `architecture` dimension fires when `[slug]` is given and `.sidekick/plans/<slug>/RFC.md` contains a `## Architecture` section (read-only conformance check; its findings are always `fixable: false`). Operator-authored members (`builtin: false`) fire whenever the review runs — they exist because the operator mounted them. `--dims a,b,c` overrides the auto-selection entirely and may name operator dimensions. Scale breadth to the change: for a tiny diff it's reasonable to fire fewer dimensions; say which you fired and why in the report's header.
- Advisory tier: operator members are `advisory` — their findings get their own report sections, marked advisory, and route like any finding, but they are excluded from the roll-up verdict and from `--fix` scope (an advisory dimension surfaces; it never fails the review or triggers edits on its own authority).
- Per-goal verdict (from the `goal` reviewer's deliverable): get it from the `goal-verdict` CLI — pass the verifier JSON to `sidekick goal-verdict` on stdin and read each goal's `verdict` (GAP|INCONCLUSIVE|ACHIEVED). This is the single source for that rollup, shared with `/sk-goal-verify` (no restated rule). (The MISSING/STUB vs HOLLOW/ORPHANED split in the verifier's `artifacts[]` drives the route below.)
- Roll-up verdict from the aggregated returns: any `goal` GAP → `gaps_found`; elif any code finding of severity `critical`/`important` → `findings`; elif any `inconclusive` goal → `inconclusive`; else `passed`.
- Route per finding/gap: code finding with `fixable: true` → **fix** (via `--fix` or manual); code finding `fixable: false` → **human** (architecture findings → redesign/human, never fix); goal GAP (MISSING/STUB) → **finish-build**; goal GAP (HOLLOW/ORPHANED, design can't satisfy) → **redesign**; INCONCLUSIVE → **human-verify**.
- `--fix` scope: default = `fixable && severity ∈ {critical, important}`; `--all` adds `minor`. Never includes goal gaps.
</reasoning>

<inputs>

| Arg | Required | Notes |
|---|---|---|
| `[slug]` | no | optional enrichment — if `.sidekick/plans/<slug>/` exists, enables the goal dimension and RFC context |
| `--range <base>..<head>` | no | default `<default_branch>..HEAD`; `working_tree` allowed |
| `--dims a,b,c` | no | override auto-selection (`correctness,security,maintainability,test,goal,architecture`) |
| `--fix` | no | run the bounded remediation loop on fixable findings |
| `--all` | no | with `--fix`, include `minor` severity in fix scope |

</inputs>

<hard_stops>

- `error: empty_diff` — resolved diff is empty. Hint: feature branch or `--range`.
- `error: on_default_branch_for_fix` — `--fix` was set and the `branch-precheck` CLI (operation `review`) returned `hard_stop` on the default branch. Don't commit auto-fixes to the integration line; surface the helper's message.
- `error: subagent_failed` — a reviewer or `sk-fixer` returned malformed JSON / its own error shape.

Format: `/sk-review halted.` then `error: <code>` + `Reason:`.
</hard_stops>

<workflow>

### Step 1 — Resolve diff + ticket context
Resolve `diff_target` and `changed_files` per `<reasoning>`; empty → hard-stop `empty_diff`. If `[slug]` is given, record whether `.sidekick/plans/<slug>/RFC.md` exists (enables `goal`).

### Step 2 — Load the quorum, select dimensions
Run the `verifiers` CLI (review surface, per `<reasoning>`) and parse its JSON for the membership and warnings. Compute the fired set per `<reasoning>` (or honour `--dims`). State the selected set, the rationale, and any registry warnings in prose (it becomes the report header).

### Step 3 — Parallel dispatch
In ONE message, dispatch one `Agent` call per fired dimension, using each member's `agent` as the `subagent_type`:
- code dims → `subagent_type: sk-<dim>-reviewer` with `diff_target`, `changed_files`, and `ticket_slug` if present;
- `goal` → `subagent_type: sk-goal-verifier` with `ticket_slug` + `diff_target`;
- `architecture` → `subagent_type: sk-architecture-reviewer` with `diff_target`, `changed_files`, `ticket_slug`;
- operator members → their registry `agent` with the same fields as code dims (`diff_target`, `changed_files`, `ticket_slug` if present).

Each reviewer receives only the artifact (`diff_target` / `changed_files`) and the spec context (`ticket_slug`) — never a producer's reasoning or self-report. That seal is what keeps the verification independent (Rule 5); preserve it on any future edit — do not pass a producer's notes or rationale into a reviewer dispatch.

Wait for all; parse each trailing ```json``` fence. A malformed return → `subagent_failed`.

### Step 4 — Aggregate
Collect all code findings (carry their `dimension`) and the goal result; if the goal dimension ran, get its per-goal verdicts from the `goal-verdict` CLI (`<reasoning>`). Compute the roll-up verdict and per-finding routes per `<reasoning>`.

### Step 5 — `--fix` loop (only if `--fix`)
1. Run the `branch-precheck` CLI (`"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" branch-precheck --operation review`, Bash) and parse stdout JSON; `hard_stop` on the default branch → `on_default_branch_for_fix`.
2. Select in-scope findings (`fixable && severity` in scope). Iterate, cap **3** rounds:
   - For each in-scope finding (stable order by file:line): capture the **baseline** first (`git status --porcelain=v1` paths), then dispatch `sk-fixer` with the `finding` + `diff_target`. If `applied: false`, route it out (leave for the human) and continue.
   - After `applied: true`, run the scope gate to get the **actual** change set the fix produced (baseline subtracted): `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" scope-check --declared <finding's file> --baseline <csv> --reported <fixer's files_changed csv>`.
     - `verdict: "clean"` → run the repo's FRESH typecheck + the relevant test command (read from `package.json`/`.sidekick/config.json`). On pass → stage and commit the **actual** set (`git add <actual> && git commit`, `fix(<dim>): <summary> [review]`). On fail → roll back the actual set to the baseline (`git checkout --` for tracked paths, delete untracked paths the fix created) and mark the finding `fix_failed`.
     - `verdict: "out_of_scope"` → the fix wrote outside the finding's file. Roll back the actual set the same way (restore baseline) and mark the finding `fix_failed` — no commit, and no retry: unlike sk-build's executor, a fixer that wandered outside its finding gets no second attempt; the finding is left for the human.
   - After the round, re-dispatch only the *affected* dimensions on the new diff. If their findings are clear (or only non-fixable remain), stop; else next round.
3. Stop at clean, at the 3-round cap, or when only non-fixable findings remain.

### Step 6 — Render + trail
Emit `# Review — <slug-or-working>` with the selected-dimensions header (including registry warnings), then a **section per dimension** (status + findings with severity/file/line/description/why/route; operator sections labelled *advisory*), the **goal section** if fired (per-goal verdict + route, plus any blocker `anti_patterns` and `human_verification` items), and — under `--fix` — a **remediation summary** (fixed / declined / fix_failed, with commit hashes). Close with the roll-up verdict + the routed next actions. Write raw returns + report to `.sidekick/cache/reviews/<slug-or-branch>/review-$(date +%Y%m%dT%H%M%S).json` (gitignored).

</workflow>
