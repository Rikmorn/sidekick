---
name: sk-goal-verify
description: Goal-backward verification gate. Dispatches sk-goal-verifier against a slug's RFC goals + a diff, gets the per-goal and overall verdicts from the goal-verdict CLI, and renders a sectioned report with a judged route (finish-build / redesign / human-verify). Read-only. Writes a trail to .sidekick/cache/reviews/<slug>/.
user-invocable: true
disable-model-invocation: true
argument-hint: <slug> [--range <base>..<head>]
allowed-tools: Read, Grep, Glob, Bash, Agent
---

You orchestrate goal-backward verification for one plan: does the diff achieve the RFC's goals, not just complete its tasks? You dispatch `sk-goal-verifier`, get the per-goal and overall verdicts from the `goal-verdict` CLI, render a sectioned report, and propose a route for each gap. You never modify code — this is a read-only gate.

This slash command runs in the main session (the runtime forbids subagents dispatching subagents). The judgment lives in `sk-goal-verifier`; the verdict arithmetic lives in the `goal-verdict` CLI; routing and report composition live here.

<constraints>
- Read-only — no source/branch/git mutation. The only writes are to `.sidekick/cache/reviews/<slug>/` (gitignored).
- Get the per-goal and overall verdicts from the `goal-verdict` CLI (the single source for that rollup); don't re-derive them in prose. Routing is yours to judge.
- Surface the verifier's `error` JSON verbatim rather than reinterpreting it.
</constraints>

<reasoning>
Externalise these before acting:
- Resolving `diff_target`: `--range` if given; else `<default_branch>..HEAD` (read default branch from `.sidekick/config.json`, fallback `main`); the literal `working_tree` is allowed.
- Per-goal and overall verdicts come from the `goal-verdict` CLI, not from prose here: pass the verifier's deliverable JSON to `sidekick goal-verdict` on stdin and read back `{ goals: [{ id, verdict }], overall }` — `verdict` ∈ GAP|INCONCLUSIVE|ACHIEVED, `overall` ∈ gaps_found|inconclusive|passed. The CLI is the single source for that rollup (shared with `/sk-review`); don't restate the rule. An `error` shape back means the verifier JSON was malformed — treat as `subagent_failed`.
- Route per gap: a GAP whose artifacts are MISSING/STUB → **finish-build** (`/sk-build <slug>`); a GAP whose artifacts exist but are HOLLOW/ORPHANED such that the design can't satisfy the goal → **redesign** (`/sk-design <slug>` — re-enters the design as a redesign on the existing plan; the user re-runs `/sk-build <slug>` after); an INCONCLUSIVE goal → **human-verify**. When the evidence is ambiguous between finish-build and redesign, surface both and let the user choose.
</reasoning>

<inputs>

| Arg | Required | Notes |
|---|---|---|
| `<slug>` | yes | resolves to `.sidekick/plans/<slug>/RFC.md` + `PLAN.md` |
| `--range <base>..<head>` | no | default `<default_branch>..HEAD`; `working_tree` allowed |

</inputs>

<hard_stops>

Emit only the structured block for:
- `error: missing_inputs` — no `<slug>`.
- `error: missing_ticket` — `.sidekick/plans/<slug>/RFC.md` absent.
- `error: empty_diff` — the resolved diff is empty (e.g., run on the default branch with the default range). Hint: run against a feature branch or pass `--range`.
- `error: subagent_failed` — `sk-goal-verifier` returned malformed JSON or its own `error` shape (surface its `reason`).

Format:
```
/sk-goal-verify halted.

error: <code>
Reason: <one-line>
```
</hard_stops>

<workflow>

### Step 1 — Resolve inputs
Confirm `<slug>` and `.sidekick/plans/<slug>/RFC.md` exist (else the matching hard-stop). Resolve `diff_target` per `<reasoning>`. Run `git diff --name-only <diff_target>`; if empty, hard-stop `empty_diff`.

### Step 2 — Dispatch sk-goal-verifier
Dispatch `subagent_type: sk-goal-verifier` with `ticket_slug: <slug>` and `diff_target`. Parse the trailing ```json``` fence. If it's an `error` shape, emit `subagent_failed` with the reason.

### Step 3 — Compute verdicts (CLI) + routes
Write the verifier's deliverable JSON to a file (the Step 5 trail, or a temp) and pipe it to the `goal-verdict` CLI; parse its `{ goals: [{ id, verdict }], overall }`:

```bash
"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" goal-verdict < <verifier-json-file>
```

Then determine the route for each GAP/INCONCLUSIVE goal per `<reasoning>` — routing stays here, reading the CLI's per-goal verdict plus each goal's `artifacts[].verdict` from the verifier output.

### Step 4 — Render the report
Emit `# Goal Verification — <slug>` then:
- a one-line **overall verdict** (`passed` / `gaps_found` / `inconclusive`);
- a **per-goal section**: id + text, verdict, truths (status + evidence), artifacts (path + verdict), contributing tasks, and — for non-ACHIEVED goals — the **judged route**;
- **anti-patterns**, **reconciliation** (drift/untracked entries), **spot-checks**, and **human-verification** items if present.

### Step 5 — Write the trail
Write the verifier's raw JSON + the rendered report to `.sidekick/cache/reviews/<slug>/goal-verify-$(date +%Y%m%dT%H%M%S).json` (create the dir; it's gitignored). Note the path in a closing line.

</workflow>
