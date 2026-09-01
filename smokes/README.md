# sidekick manual smokes

End-to-end smokes for the sk-* engineering toolchain (`/sk-decide`, `/sk-design`, `/sk-build`, `/sk-review`). These can't run under Vitest because slash commands execute inside Claude Code's runtime — they orchestrate subagents over a real conversation. The TypeScript unit tests cover deterministic helpers; these smokes cover the orchestration paths.

Run them at milestone-end, batched. The fixture under `fixtures/minimal-repo/` provides a self-contained substrate: a single `add(a, b)` function, one passing test, and a pre-populated `.sidekick/config.json` whose gates resolve to `pnpm typecheck` / `pnpm lint` / `pnpm test`.

The fixture artifacts (RFC.md, PLAN.md drafts the smokes produce) are intentionally trivial. The goal is to exercise the orchestrator's wiring (dispatch → verdict → commit), not to produce a meaningful design document — thin smoke output is expected, not a regression.

> **Smokes 13–15 now also live as eval cases (3.3).** The eval harness (`sidekick eval run`, ADR-0006) ports Smokes 13/14/15 into repeatable cases under `evals/cases/`: the non-interactive agent dispatches (coherence-checker verdicts, rfc-drafter reconciliation, decide cross-RFC coherence) run under the runner as `coherence-agent/`, `rfc-drafter/`, `decide-coherence/`; the dialogic segments (`/sk-design` quorum re-dispatch loops, divergence dialogue, orchestrator wiring) carry `manual: true` and still follow **this README's** procedures — their expectations are captured in the case's `expect` field for reference. Run the agent-lane cases with `sidekick eval run <suite>`; run the manual-lane cases here.

## Setup

```bash
# 0. Point AL at your sidekick worktree root (used throughout this procedure)
AL=/path/to/sidekick         # set this to your sidekick worktree root

# 1. Bootstrap workspace dependencies (skip if already installed)
cd "$AL"
pnpm install

# 2. Copy the fixture into a fresh tmpdir
TMP=$(mktemp -d)
cp -R "$AL/smokes/fixtures/minimal-repo/." "$TMP/"
cd "$TMP"

# 3. Initialise git (sk-build atomic commits + drift detection need a repo)
git init -q
git add -A
git commit -q -m "initial"

# 4. Install fixture dev deps so gates can actually run
pnpm install

# 5. Build and install the sidekick harness from the worktree
cd "$AL"
pnpm build
node dist/cli.js install
# → writes ~/.claude/{skills,agents}/sk-*, ~/.claude/sidekick/rules/, manifest

# 6. Make `sidekick` resolvable via npx from $TMP.
#    The package isn't published to a registry, so `npx sidekick ...` won't
#    resolve from a fresh tmpdir. Smoke 1 (`init`) and the `branch-precheck` /
#    `check-drift` calls embedded in `/sk-decide` and `/sk-build` all need it
#    locally linked.
cd "$AL"
pnpm link --global
cd "$TMP"
pnpm link --global sidekick

# 7. Open Claude Code with $TMP as cwd, then run each smoke below
cd "$TMP"
claude
```

## Manual smokes (in Claude Code)

Smokes 3 → 4 → 5 are sequential: smoke 4 needs the PLAN.md produced by smoke 3, and smoke 5 needs smoke 4's committed state. Smokes 1 and 2 are independent.

### Smoke 1: init

```
npx sidekick init
```

Interactive. Walks the user through `defaultBranch` and the three gate commands.

Expected:
- Prompts appear in order: `defaultBranch`, `gates.typecheck`, `gates.lint`, `gates.test`.
- On confirm, writes `.sidekick/config.json` matching `SidekickConfig` schema (schemaVersion: 1).
- Idempotent — re-running offers to overwrite.

### Smoke 2: /sk-decide

First, no candidate:

```
/sk-decide
```

Expected: hard-stop with `no_topic_candidate` (no RFC.md exists under `.sidekick/plans/*/`, no explicit topic supplied).

Then, explicit topic:

```
/sk-decide explicit-topic-here
```

Expected:
- Dispatches `sk-decision-drafter` for adaptive Q&A.
- Writes `.sidekick/decisions/explicit-topic-here.md` with MADR frontmatter + sections.
- Runs the `check-artifact` gate (`--type decision`); verdict `pass`.
- Atomic commit lands on the current branch.

### Smoke 3: /sk-design (low complexity, no research)

```
/sk-design rename-add-to-sum
```

Expected:
- `sk-explorer` runs Q&A on scope (single function rename).
- Complexity classified `low` — no research specialists dispatched.
- `sk-rfc-drafter` produces `.sidekick/plans/rename-add-to-sum/RFC.md`.
- `sk-plan-drafter` produces `.sidekick/plans/rename-add-to-sum/PLAN.md` with `pins-rfc:` matching the RFC hash.
- The `check-artifact` gate (structural + crossref) passes.
- Atomic commit lands containing both files.

### Smoke 4: /sk-build (single task)

Using the PLAN.md from smoke 3:

```
/sk-build rename-add-to-sum
```

Expected:
- the `branch-precheck` CLI confirms branch state.
- `sk-executor` rewrites `src/index.ts` (e.g. exports `sum` instead of `add`) and the test.
- Gates run FRESH from `.sidekick/config.json` (no cached results): `pnpm typecheck`, `pnpm lint`, `pnpm test`. All pass.
- `sk-spec-reviewer` verifies the change against the plan task.
- Atomic commit lands per task.

### Smoke 5: adversarial — drift

After smoke 4 has committed at least one task, manually edit the RFC to simulate drift:

```bash
# Outside Claude Code
echo "" >> .sidekick/plans/rename-add-to-sum/RFC.md
echo "## Drift marker" >> .sidekick/plans/rename-add-to-sum/RFC.md
git add .sidekick/plans/rename-add-to-sum/RFC.md
git commit -m "simulate drift"
```

Then re-run build:

```
/sk-build rename-add-to-sum
```

Expected:
- `sidekick check-drift rename-add-to-sum` reports `pins-rfc` mismatch.
- The skill surfaces a warning to the user but continues (warn-only in M1; hard-stop is M2).

## M2 setup (verification smokes)

Smoke 6 needs a feature branch with a mix of tagged/untagged commits and a deliberate reviewable issue. From `$TMP` (after the base Setup above):

```bash
git checkout -b feat/refund-window

# T-01 with a deliberate correctness + maintainability issue for /sk-review to find
cat > src/refund.ts <<'EOF'
export function isWithinRefundWindow(orderDate: Date, now: Date) {
  const ms = now.getTime() - (orderDate as any).getTime(); // `as any` → maintainability finding
  return ms < 30 * 24 * 60 * 60 * 1000; // boundary not handled → correctness finding (g2)
}
EOF
git add -A && git commit -q -m "feat(refund): add isWithinRefundWindow [T-01]"

# T-02 tagged
cat > src/refund.test.ts <<'EOF'
import { expect, it } from 'vitest';
import { isWithinRefundWindow } from './refund.js';
it('in window', () => {
  expect(isWithinRefundWindow(new Date('2026-05-01'), new Date('2026-05-10'))).toBe(true);
});
EOF
git add -A && git commit -q -m "test(refund): in/out window [T-02]"

# An untagged commit (exercised the retired /sk-regen-plan smoke; harmless to keep)
git commit -q --allow-empty -m "chore: tidy refund types"
```

### Smoke 6: /sk-review (quorum + --fix)

```
/sk-review refund-window --range main..HEAD
```
Expect: a sectioned report. **correctness** flags the unhandled boundary (g2) — likely `fixable: false` (intended behaviour is a judgment); **maintainability** flags the `as any` (`fixable: true`, cites sk-typescript); **goal** reports g2 as a GAP (boundary not satisfied) with a route, and its reconciliation lists T-01/T-02 as untracked (implemented but unchecked in PLAN.md). Roll-up `findings`/`gaps_found`.

Then:
```
/sk-review refund-window --range main..HEAD --fix
```
Expect: the `branch-precheck` CLI proceeds (on a feature branch, not default); the `as any` maintainability finding is fixed by `sk-fixer`, typecheck/test run FRESH, an atomic `fix(maintainability): … [review]` commit lands; the boundary correctness finding and the g2 goal gap are **not** auto-fixed (routed out). Confirm a `.sidekick/cache/reviews/refund-window/` trail was written and is gitignored.

### Smoke 7: /sk-goal-verify — retired (#25)

Folded into `/sk-review`'s goal dimension. Smoke 6's goal-section expectation now carries the reconciliation assertion this smoke held.

### Smoke 8: /sk-regen-plan — retired (#26)

The skill and `sk-plan-reconciler` are retired; the `reconcile-plan` CLI and `branch-precheck`'s `regen-plan` operation remain in the kernel until R3 reworks the plan machinery (#29).

## M3 setup (wave-build smoke)

Smoke 9 uses the `wave-build` fixture from `fixtures/wave-build/`. Copy it into a fresh tmpdir (same base Setup as above), then from that dir:

```bash
TMP_WAVE=$(mktemp -d)
cp -R "$AL/smokes/fixtures/wave-build/." "$TMP_WAVE/"
cd "$TMP_WAVE"
git init -q
git add -A
git commit -q -m "initial"
```

Note: `sidekick init` normally gitignores `.sidekick/cache/` + `.sidekick/state/`. The `wave-build` fixture ships a pre-made `.sidekick/config.json` (don't re-init and overwrite it), so add the ignore line manually before the first build:

```bash
echo ".sidekick/state/" >> .gitignore
git add .gitignore && git commit -q -m "chore: gitignore sidekick state"
```

### Smoke 9: /sk-build (wave-based) + /sk-review (architecture dimension)

#### Part A — verify wave computation

```
wave-plan wave-build
```

(Invoked by the skill as `sidekick wave-plan wave-build --format=json`.)

Expected JSON — three waves, one file-overlap warning:

```json
{
  "verdict": "planned",
  "slug": "wave-build",
  "waves": [["T-01"], ["T-02", "T-03", "T-05"], ["T-04"]],
  "task_count": 5,
  "warnings": [
    "T-01 and T-05 share file(s) [src/foo.ts] with no dependency between them — serialized (T-01 before T-05)."
  ]
}
```

Confirm: T-02 and T-03 share a wave (both depend only on T-01, disjoint files). T-05 is serialized into Wave 2 rather than Wave 1 because it shares `src/foo.ts` with T-01 (file-overlap edge). T-04 is alone in Wave 3.

#### Part B — run the wave build

```
/sk-build wave-build
```

Expected:
- the `branch-precheck` CLI confirms branch state (proceed on `main` or a feature branch).
- Waves computed from PLAN.md via `sidekick wave-plan wave-build --format=json`.
- **Wave 1 — T-01:** `sk-executor` creates `src/foo.ts`. Gates run FRESH (`pnpm typecheck`, `pnpm lint`, `pnpm test`). Atomic commit lands: `feat(wave-build): scaffold foo module [T-01]`. Checklist checkbox for T-01 flipped in the same commit.
- **Wave 2 — T-02, T-03, T-05:** All three tasks executed (T-02 and T-03 in parallel if the skill supports it, T-05 serially or parallel — order within the wave is T-NN ascending). Three atomic commits land. Checklist checkboxes for T-02, T-03, T-05 flipped.
- **Wave 3 — T-04:** `sk-executor` creates `src/qux.ts`. Atomic commit lands.
- After all waves: `.sidekick/state/wave-build/build.json` written. Confirm it exists and reflects completion per the `<build_state>` schema — every entry in `tasks` is `done`/`skipped` and `next_action` shows no remaining wave.

#### Part C — adversarial deviation

Inject a deliberately under-specified task to exercise the deviation path. Before running `/sk-build` on a fresh copy, edit T-02 in PLAN.md so its description is contradictory or empty (e.g. delete the description body). Then re-run:

```
/sk-build wave-build
```

Expected: when `sk-executor` produces output that doesn't match the task spec, `sk-spec-reviewer` returns a `deviation` verdict. With `buildCheckpoints: "deviations-only"`, the skill batches it and presents: `Wave 2 — 1 deviation(s) to route`. You're offered `amend`, `redesign`, `skip`, `decide`, or `pause` for each. Choosing `amend` re-dispatches the executor with the reviewer's feedback.

#### Part D — /sk-review fires architecture dimension

The `wave-build` RFC has a `## Architecture` section declaring that `src/qux.ts` must not import directly from `src/foo.ts`. After the wave build completes:

```
/sk-review wave-build --range main..HEAD
```

Expected:
- Review dimensions dispatched include **architecture** (because the RFC has `## Architecture`).
- `sk-architecture-reviewer` reads the RFC's architecture contract and checks the diff. If `src/qux.ts` was implemented to import directly from `src/foo.ts`, the reviewer surfaces a finding. If the executor respected the layering, the reviewer reports clean.
- Confirm `.sidekick/cache/reviews/wave-build/` trail was written and is gitignored.

## E19 setup (fan-out seam smoke)

Smoke 10 exercises the research path of `/sk-design` — deferred from the earlier smoke pass because it requires E19's fan-out seam — through both backends. Use the base Setup above with the `minimal-repo` fixture. Parts B–C add a `fanout` key to the fixture's `.sidekick/config.json` (the base fixture does not include one).

### Smoke 10: /sk-design research path via the seam

#### Part A — probe

```
npx sidekick capabilities
```

Expected: JSON report with a `workflows.available` field set to one of `"likely"`, `false`, or `"unknown"`. Note the value — it determines which backend Part B's `auto` resolves to, and whether Part C is applicable.

#### Part B — agents backend (the baseline; works everywhere)

Set `.sidekick/config.json` → `"fanout": { "backend": "agents", "budget": "standard" }`, then:

```
/sk-design caching-layer-for-add --auto medium
```

Expected:
- `sk-explorer` `proceed`s on the clean slug (no Q&A); `--auto medium` runs hands-off and drives standard-tier research regardless of complexity.
- Researchers dispatched as parallel `Agent` calls, one per research hint.
- `sk-research-synthesiser` merges; RFC.md / PLAN.md / RESEARCH.md land under `.sidekick/plans/caching-layer-for-add/`.
- RESEARCH.md header carries `fanout: backend=agents, budget=standard`.

#### Part C — workflow backend (only where Part A said `likely`)

Part B writes artifacts under `.sidekick/plans/caching-layer-for-add/`; a re-run on the same slug would collide with those files. Start from a clean fixture copy:

```bash
TMP_C=$(mktemp -d)
cp -R "$AL/smokes/fixtures/minimal-repo/." "$TMP_C/"
cd "$TMP_C"
git init -q
git add -A
git commit -q -m "initial"
```

Set `.sidekick/config.json` → `"fanout": { "backend": "workflow", "budget": "standard" }` in `$TMP_C`, then from Claude Code in that directory:

```
/sk-design caching-layer-for-add --auto medium
```

Expected:
- The researcher fan-out launches as a single Workflow run (`/workflows` shows it; researchers appear as agents with `agentType: sk-researcher-*`).
- Downstream artifacts identical in shape to Part B; RESEARCH.md header says `backend=workflow` and records the run's token total.

**Adversarial sub-case:** verify the seam falls back gracefully when Workflows are disabled.

1. Exit Claude Code.
2. In the shell: `export CLAUDE_CODE_DISABLE_WORKFLOWS=1`
3. Relaunch: `cd "$TMP_C" && claude`
4. Re-run: `/sk-design caching-layer-for-add --auto medium`

Expected: the seam falls back to the agents backend with a note in reasoning prose, not a hard-stop.

#### Part D — quick tier

Re-run Part B with `--auto low` (on a fresh slug or clean fixture copy, as in Part C — a same-slug re-run would `slug_collision`). Expected: exactly ONE researcher dispatched (first hint); synthesiser still runs; artifacts land; RESEARCH.md says `budget=quick`.

## E23 setup (two-mode interaction smoke)

Smoke 11 exercises the E23 interaction rework of `/sk-design`: dialogue-by-default, with `--auto <low|medium|high>` as the hands-off escape hatch, and the retired `--research`/`--budget` flags now erroring. Use the base Setup above with the `minimal-repo` fixture. As in Smoke 10, each part needs a fresh slug — re-running on a slug whose `.sidekick/plans/<slug>/` already exists hard-stops with `slug_collision`, so the parts use distinct illustrative slugs (and Parts that fan out research add the same `fanout` key Smoke 10 Part B does).

### Smoke 11: /sk-design two-mode interaction

#### Part A — default dialogue (no flag)

```
/sk-design dark-mode-toggle
```

Expected:
- `sk-explorer` runs first as groundwork (read-only repo grounding — analogues, prior decisions, `scope_signal`); the `branch-precheck` CLI reads git state.
- The orchestrator **opens with a conversation, not a finished RFC**: it surfaces its understanding of the work, the complexity signal the explorer returned ("looks straightforward" / "looks involved"), and where research would likely pay off — without running any research yet.
- Research runs **only on request or with an explicit announcement** of what it's about to research and why — not a reflexive upfront pass. (If you never ask for it and the orchestrator never announces one, no researchers are dispatched and no RESEARCH.md is written — that's correct for a dialogue that didn't need prior art.)
- When you signal the design is clear (e.g. "looks clear, draft it"), it converges: drafts RFC.md → PLAN.md, runs the `check-artifact` gate on each (structural on the RFC; structural + crossref on the PLAN) and the `sk-coherence-checker` quorum, and ends with a **light `ship / tweak / cancel` confirm**.
- On `ship`, artifacts land under `.sidekick/plans/dark-mode-toggle/` (RFC.md + PLAN.md; RESEARCH.md only if research ran) and a single `design(dark-mode-toggle): draft RFC and PLAN` commit lands.

#### Part B — `--auto medium`

```
/sk-design csv-export --auto medium
```

Expected:
- **No conversation** — produce-and-confirm end-to-end. The explorer `proceed`s on the clean slug and the run flows straight through.
- `medium` maps to the **`standard`** research tier: one researcher per hint, parallel, synthesiser merge — dispatched without pausing to ask whether to research (the effort word already answered that).
- The single pause is a **one-line confirm before commit** (e.g. "Designed `csv-export` (RFC.md, PLAN.md, RESEARCH.md) — go / cancel").
- Artifacts are **identical in shape to Part A** — RFC.md / PLAN.md / RESEARCH.md under `.sidekick/plans/csv-export/`, gated through the same structural + quorum checks, one atomic commit. (Set `.sidekick/config.json` → `"fanout": { "backend": "agents", "budget": "standard" }` first, as in Smoke 10 Part B, so the seam resolves deterministically.)

#### Part C — `--auto low` escalation (honest-autonomy breakout)

Pick a slug whose scope hides a **load-bearing unknown the orchestrator cannot infer** from the topic or the repo — e.g. retry durability:

```
/sk-design webhook-retries --auto low
```

Expected:
- The explorer `proceed`s; branch precheck `proceed`s. `low` would normally keep it shallow and hands-off.
- As it works toward a draft, the orchestrator hits a fork it genuinely can't assume away (in-process timer vs. durable queue — the two produce different architectures). Honest-autonomy outranks the effort word here.
- It **breaks out exactly ONCE** for one focused question ("should retries survive a process restart? it changes the architecture"), then **completes hands-off** from your answer — research at the `quick` tier (still `low`), Finalisation, and the one-line confirm before commit. No second interruption.

#### Part D — removed flag errors

```
/sk-design legacy-import --research
```

Expected: a clear **`unknown flag --research; see --auto`** error — not a silent ignore, and not a research run. Same for `--no-research` and `--budget` (e.g. `/sk-design legacy-import --budget quick` → `unknown flag --budget; see --auto`). This is the converse of Smoke 10 Parts B–D, which now use the `--auto` equivalents.

## E20 setup (tier-0 config guard smoke)

Smoke 12 exercises the E20 tier-0 hook: a Claude Code PreToolUse DENY of agent edits to `.sidekick/config.json`, plus a non-blocking Stop advisory backstop that catches the Bash-bypass channel, both installed by `sidekick init` into the consumer's `.claude/settings.local.json`. Hooks can't be unit-tested for "does CC actually fire it" — whether the runtime honours the deny and surfaces the advisory is exactly the gap this manual check fills (same rationale as Smokes 10 and 11). Use the base Setup above with the `minimal-repo` fixture.

Because `bin/` changed, rebuild and reinstall the launcher, then re-init the consumer so the hook block lands in its `.claude/settings.local.json`:

```bash
pnpm build && node dist/cli.js install      # in the sidekick repo/worktree
node ~/.claude/sidekick/bin/sidekick init    # in the consumer repo (writes the hook block)
```

### Smoke 12: Tier-0 config guard

#### Part A — deny fires

In the consumer repo, ask the agent to edit `.sidekick/config.json` directly — e.g. "change the test gate to `echo skip`".

Expected:
- The `Edit`/`Write` is **DENIED** by the PreToolUse hook, with a reason naming the gate commands.
- `.sidekick/config.json` is unchanged on disk.
- The deny holds even under an accept-edits / bypass-permissions session — confirm by repeating the ask in such a session and seeing the same denial.

#### Part B — Bash-bypass advisory

Have the agent modify the file via Bash instead (`echo '...' > .sidekick/config.json`). The PreToolUse deny only watches `Edit`/`Write`, so it won't see this write.

Expected:
- The Bash write goes through (the deny doesn't cover this channel).
- At end-of-turn, the non-blocking Stop advisory surfaces ("`.sidekick/config.json` was modified this session…"), flagging the out-of-band change without blocking.
- Revert the change afterwards so the fixture is clean.

#### Part C — opt-out + idempotency

```bash
node ~/.claude/sidekick/bin/sidekick init --no-hooks
```

Expected:
- `--no-hooks` removes the sidekick hook block from `.claude/settings.local.json`. Foreign hooks (e.g. a Biome formatter the consumer already had) survive untouched.
- Re-running plain `node ~/.claude/sidekick/bin/sidekick init` twice produces **no duplicate** sidekick hook entries — the block is reconciled, not appended.
- `.claude/settings.local.json` is gitignored, so none of this lands in the consumer's git history.

#### Part D — foreign hooks preserved

If the consumer already had a `.claude/settings.local.json` with its own hook before any sidekick install, confirm that hook is intact after both `init` (block added) and `init --no-hooks` (block removed) — sidekick only owns its own block and never rewrites or drops the consumer's entries.

## E3 setup (semantic-coherence checker smoke)

Smoke 13 exercises `sk-coherence-checker` — the dimensional reviewer that
catches semantic contradictions a structural check misses (the E23-smoke gap:
an RFC whose `## Architecture` describes a design its `## Decisions` rejected).
Validation is agent-level (dispatch the checker against crafted fixtures and
assert the JSON) plus integration (the RFC/PLAN/decision quorums now dispatch
it). Fixtures live under `smokes/fixtures/coherence/`. Rebuild + reinstall first
(new agent + edited skills):

```bash
bun run build && node dist/cli.js uninstall && node dist/cli.js install
```

> **Note (session registry):** Claude Code snapshots the subagent registry at session start. The `install` above copies `sk-coherence-checker` to `~/.claude/agents/`, but a session that was already running will NOT see the new agent — dispatching it returns "agent type not found" (verified empirically during the E3 build). Run the smoke from a **fresh** Claude Code session after installing. Whether *edits* to already-registered agents/skills are picked up mid-session is not verified here, so the safe rule for any sk-* prompt change is the same: reinstall, then start a fresh session before smoking.

### Smoke 13: sk-coherence-checker

#### Part A — agent-level verdicts

Dispatch `sk-coherence-checker` against each fixture (absolute `artifact_path`):

| Fixture | artifact_type | related_paths | Expect |
|---|---|---|---|
| `rfc-cross-section/RFC.md` | rfc | — | fail (Architecture↔Decisions) |
| `rfc-intra-section/RFC.md` | rfc | — | fail (two Decisions) |
| `rfc-clean/RFC.md` | rfc | — | pass |
| `rfc-amended/RFC.md` | rfc | — | pass (A-01 supersedes D-02) |
| `plan-vs-rfc/PLAN.md` | plan | `{ rfc: …/plan-vs-rfc/RFC.md }` | fail (T-06 vs D-04) |
| `decision-internal/decision.md` | decision | — | fail (option vs Consequences) |

Dimensional separation: `check-artifact` on `rfc-cross-section/RFC.md`
(`--type rfc`) returns **pass** — shape is valid; only coherence fails.

#### Part B — RFC quorum integration (sk-design)

Run `/sk-design` to a draft whose Architecture contradicts its Decisions (or
seed `.sidekick/plans/<slug>/RFC.md` from `rfc-cross-section/RFC.md`). Expect:
the RFC gate (`check-artifact`) passes; the quorum dispatches
`sk-coherence-checker`; coherence returns `fail`; the orchestrator re-dispatches
`sk-rfc-drafter` with the coherence issue folded into `feedback`; on the third
failure it halts with `error: rfc_quorum_check_loop_exhausted`.

#### Part C — PLAN quorum integration (sk-design)

With a PLAN whose task realises a rejected decision (seed from
`plan-vs-rfc/`), the `check-artifact` gate passes and `sk-coherence-checker`
returns `fail`, re-dispatching `sk-plan-drafter`.

#### Part D — decision quorum integration (sk-decide)

With a decision doc whose chosen option contradicts its Consequences (seed from
`decision-internal/decision.md`), `/sk-decide` Step 7 runs the `check-artifact` gate, then dispatches
`sk-coherence-checker`; coherence returns `fail`,
re-dispatching `sk-decision-drafter`.

## E3 setup (drafter-reconciliation smoke)

Smoke 14 exercises `sk-rfc-drafter`'s reconciliation behaviour — the *reconcile*
half of the catch→reconcile loop Smoke 13 opened. The drafter now aligns
`## Architecture` to the *decided* design (one-directional authority: the
decision outranks every agent, including the coherence checker). Fixtures live
under `smokes/fixtures/drafter-reconciliation/`. Each `SCENARIO.md` is the
dispatch input + the expected behaviour a reviewer checks. Rebuild + reinstall
first, and run from a **fresh** Claude Code session (same session-registry
caveat as Smoke 13):

```bash
bun run build && node dist/cli.js uninstall && node dist/cli.js install
```

### Smoke 14: sk-rfc-drafter reconciliation

Dispatch `sk-rfc-drafter` against each fixture and check its `SCENARIO.md` Expected:

| Fixture | Dispatch | Expect |
|---|---|---|
| `agree-verbatim` | fresh, no feedback | `## Architecture` inserted **verbatim**; Decisions agree (g_4, no regression) |
| `divergence-reconcile` | fresh, no feedback | decided design (a listed alternative) promoted to `### Recommendation`; advisor's original rec demoted to `### Alternatives considered` with "diverged because…"; reasoning preserved (D-02) |
| `redispatch-reconcile` | re-dispatch (coherence feedback) | reconcile Architecture to D-01; untargeted sections byte-equal (D-06). The seed `RFC.md` in the dir is the on-disk artifact the drafter reads |
| `unanalysed-flag` | fresh, no feedback | decided approach stated only as far as the decision specifies + a `## Questions` flag; **no fabricated** architecture (D-05) |

**Batched** into the one end-of-E3 test session (no dispatch in the Drafters slice itself).

## E3 setup (skills-orchestrators smoke)

Smoke 15 covers the orchestrator-slice scenarios for E3 — the `/sk-design` and
`/sk-decide` integration paths that sit *above* the individual drafter and checker
agents. Cases 15.1–15.5 (`classify-deviation` helper) are covered by unit tests
under `bun test`; the five scenarios here (15.6–15.10) are prompt-level and
require a live session. Fixtures live under `smokes/fixtures/skills-orchestrators/`.
Each `SCENARIO.md` is the dispatch input + expected behaviour for a human reviewer.
Rebuild + reinstall first, and run from a session that has received the
"new agent types available" notification after install (same session-registry
caveat as Smokes 13–14 — a separately-notified session suffices; a brand-new
session is the safe fallback):

```bash
bun run build && node dist/cli.js uninstall && node dist/cli.js install
```

### Smoke 15: skills-orchestrators (15.6–15.10)

| Fixture | Scenario | Expect |
|---|---|---|
| `divergence-surface` (15.6) | `/sk-design` — advisor recommends X, dialogue settled Y on a load-bearing axis (storage/ownership model) | Orchestrator surfaces BOTH approaches with substance + real tradeoff before drafting; operator decides; drafter reconciles `## Architecture` to the decision (overridden approach → `### Alternatives considered` with "diverged because…") |
| `divergence-agreement` (15.7) | `/sk-design` — advisor's `### Recommendation` matches settled direction (cosmetic differences only) | No friction — orchestrator proceeds straight to the draft; advisor's `## Architecture` carried verbatim |
| `decide-cross-rfc-fail` (15.8) | `/sk-decide` — decision contradicts its cited source RFC; `source_rfc` non-null | `sk-decide` passes `related_paths: { rfc: source_rfc }` to `sk-coherence-checker`; checker returns `verdict: fail` on the cross-RFC contradiction |
| `decide-no-citation` (15.9) | `/sk-decide` — decision derives from no RFC; `source_rfc: null` | `related_paths` omitted; coherence check stays internal-only (no RFC read attempted) |
| `date-missing-fresh` (15.10) | `sk-rfc-drafter` dispatched on fresh-draft path without `today` | Drafter returns `missing_input` error (never invents a date); re-dispatch without `today` preserves existing `created:` byte-equal |

**Batched** into the one end-of-E3 test session alongside Smokes 13–14.

## What's not covered by these smokes

The smokes above exercise the happy path of each orchestrator plus one adversarial case (drift). The following M1 paths are NOT covered — they were deliberate deferrals, but listing them prevents future-you from assuming they were exercised:

- Q1 deviation routing in `/sk-build` (`amend` / `redesign` / `skip` / `decide` / `pause` branches).
- `group_created` path of `sk-explorer` (multi-plan fuzzy-text grouping).
- Quorum disagreement in the design reviewer pair (structural pass + crossref fail, or vice versa) → re-dispatch with combined feedback.
- `sk-spec-reviewer` `fail` verdict → re-dispatch executor with reviewer feedback.
- Gate-failure retry semantics (first failure captures context for the executor; second failure hard-stops).

These are candidates for the M2 smoke pass.

## What to capture during smokes

For each smoke, note:

- Subagent prompts that produce unexpected output shapes (e.g. extra preambles around JSON deliverables, malformed fences).
- Slash-command parse contracts that mis-extract JSON from specialist responses.
- Verdict routing not matching expectation (e.g. a `pass` treated as `fail`, retry counters off-by-one).
- Rough edges in the orchestrator's natural-language synthesis (over-confident summaries, missing the actual failure cause).

When something is rough, iterate the relevant `.claude/agents/sk-*.md` or `skills/sk-*/SKILL.md` file in this worktree. Rebuild + reinstall the plugin between iterations:

```bash
pnpm build
node dist/cli.js uninstall
node dist/cli.js install
```

Re-run only the affected smoke. If a fix touches a shared agent, re-run every smoke that dispatches it.
