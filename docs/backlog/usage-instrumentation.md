# Usage instrumentation (E21) — backlogged

**Status:** Backlogged 2026-06-16 after a design brainstorm. Deprioritised in favour of carrying on in EPIC order (E3 → E4/E5/E6). Not killed — "more useful in the future" (operator). EPIC E21 row points here.

## Why backlogged (the load-bearing distinction)

The brainstorm surfaced a distinction that reframes E21's value: **two kinds of "usage" data with different consumers.**

- **Operator-facing meta-info** — task sizes, wave widths, fan-out cost, estimate-vs-actual. *The LLM would not query this or change behaviour from it.* It's reporting. Its real value is as a data source for **E8** (externalise the sizing/routing signal — self-report is broken) and tier-calibration fuel for **E17**. This is what E21 *is*.
- **Context pressure → behaviour change** — high context = low quality, so the agent acts: deliberate checkpoint + clear + clean continuation prompt; or fan out more when nearly done. *This* is behaviour-changing — and it is **E9** (forcing-function for context/escalation: "a hook that triggers compact/handoff/escalate at thresholds + structured/verbatim handoff over lossy LLM re-summarization"), already on the roadmap, "fairly independent," and it **mounts on E20's hooks base** (now unblocked).

So the high-value, behaviour-changing capability the operator cares about is **E9, not E21**. E21 is operator meta-info. Conflating them muddied both; separating them is the point.

Additional reasons E21 is low-urgency now:
- **The data largely already exists.** sk-design already writes `fanout: backend=…, budget=…` (+ workflow token total) into each RESEARCH.md header (committed). `/workflows` shows workflow tokens; agent dispatches carry `subagent_tokens`; the session transcript is on disk. E21 is a re-structuring/convenience layer, not new information.
- **Not on the critical path to F8/E17.** F8 (keep/drop the workflow backend) is unblocked by the **one manual comparison run** (read tokens off `/workflows`), not by instrumentation. E21 only helps accumulate *many* longitudinal points — a refinement.

## Converged design (if/when built)

Shape settled during the brainstorm — pure-derivation, honouring the operator constraint *"tooling does the heavy lifting, agents/skills stay focused (log the estimate as they do now)."*

- **`sidekick usage [<slug>] [--format json|table]`** — a read-only Node helper, sibling of `wave-plan`, reusing `parsePlanTasks()`. **Zero skill edits.** Derives metrics from committed artifacts + git:
  - **Estimate** = the plan (task count, file scope, waves, goals/decisions) — from the current PLAN.md, or the plan's first git commit when you want the *original* estimate frozen before deviations/`regen-plan` mutate it.
  - **Actual** = git task commits (matched by tag) → tasks completed + churn (diffstat per task).
  - **Delta** = estimate-vs-actual, the calibration signal (does ADR-0001's "tasks are small" assumption hold? did sizing estimates survive contact?). This is the **E8 sizing down-payment.**
  - **Research cost** = the RESEARCH.md `fanout:` header (formalise to frontmatter for robust parsing), giving backend/tier/workflow-tokens.
  - **Retroactive** — runs over every existing plan today (an event log only captures going forward).

- **Tokens = the one runtime-only, error-prone value, deferred.** Agents-backend + build-phase tokens are not in any artifact or in git. They need a run-time write. The operator's **"write metadata at start, update on completion"** pattern is exactly where this lands later — estimate cost at plan time, actual cost stamped at build completion — but it's the error-prone part and is explicitly out of the first cut. "Values slightly off or missing is fine — it's observability, not billing."

- **Rejected:** an append-only JSONL event log in a folder (drifts, ephemeral, cache-clearable, only forward-capturing) and a written `estimate:` frontmatter block emitted by `sk-plan-drafter` (the operator wants skills to stay focused; the plan body already *is* the estimate, so tooling reads it rather than skills writing a redundant block).

## Storage / memory coupling (flagged, unresolved)

Both E21's data and E9's "save the session somewhere" brush the **memory chain**: E10 (navigability over markdown memory — "recommended first real build") and E15 (memory *substrate* decision — markdown vs SQLite+FTS5/sqlite-vec vs graph; "do NOT pre-pick"). The operator's instinct ("this kind of data is where storage would come in, and this would likely impact memory storage") is correct. Coupling is **soft** — E9 can checkpoint to a simple local file without resolving the substrate — but when E21/E9 are built for real, the storage question (where operational/session state lives, how it relates to memory) should be answered deliberately, not defaulted.

## Where E21's value is realised (downstream consumers)

- **E8** — empirical sizing signal (estimate-vs-actual task sizing).
- **E17** — budget-tier calibration (with the owed comparison run + F8).
- **ADR-0001** — validates the "most tasks are small → lean behavioural harder" assumption.

## Verified feasibility notes (this session, 2026-06-16)

- `parsePlanTasks()` in `bin/helpers/wave-plan.ts` already extracts per-task `id`/`deps`/`files` from PLAN.md; `wave-plan` already computes wave structure. The derivation parser largely exists.
- PLAN.md frontmatter = `slug`, `pins-rfc`, `created`; tasks are `### T-NN` with `**Deps:**`/`**Files:**`. RFC.md carries goals/decisions. RESEARCH.md carries the `fanout:` header. All committed, slug-scoped.
- Tokens are visible to the orchestrator (`/workflows` total; per-agent `subagent_tokens`) but are runtime-only — not recoverable from artifacts or git after the fact.

## Revisit when

- E8 is taken up (E21's estimate-vs-actual is its most natural data source), or
- F8/E17 calibration wants longitudinal cross-run data and the RESEARCH-header + `/workflows` route proves too painful, or
- The storage/memory substrate (E10/E15) is decided, giving this data a proper home.
