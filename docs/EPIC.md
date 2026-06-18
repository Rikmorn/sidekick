# EPIC — Apply the research learnings to the harness

> **North-star.** Sidekick is an **oversight harness** for AI-assisted engineering — it owns the loop (research → design → build → verify), the gates, the verification, and the escalation, and *rents* the wording. This EPIC applies the research program's learnings to that harness. The durability filter on every item: **build the oversight harness; rent the wording** — own the structure, treat specific prompt phrasings as rentable and re-checkable per model generation. The aim is a harness that gets **more** reliable as the underlying models improve, not one that becomes a tax on them.

**Status (2026-06-18):** Architecture settled (ADR-0001/0002/0003). Toolchain built and working (6 skills + 24 agents + 9 CLI helpers + tier-0 hook). **Phase 0 complete**; **Phase 1 in progress** — `1.1` (coherence reconciliation) done 2026-06-18; `1.2`–`1.5` remain. Phases 2–5 unstarted. Live state snapshot: [`EPIC-STATE.md`](./EPIC-STATE.md).

---

## How to read this roadmap

- **IDs are `{phase}.{item}` and the number encodes intended execution order.** `3.1` comes before `3.2`; Phase 2 comes before Phase 3. This replaces the old `E#` priority numbers + tiers, which carried no order (and accumulated a confusing renumbering map).
- **Stability rule — append, never renumber.** A new item joins its phase at the next free number (`3.5`, `3.6`, …). Items already assigned keep their ID for life. Phases are stable buckets. This is the property the `E#` scheme lacked.
- **Legacy `E#` references still exist** in the ADRs, research reports, backlog, memory, and commit tags (`[E3]`). They are historical and resolve through the **[Crosswalk](#crosswalk--legacy-e--phaseitem)** below — they are not rewritten (decision records and research history are kept as-authored).
- **Sources** link the research that justifies an item; **Deps** name prerequisites by their new ID.
- **Detail** for completed work lives in the [Execution log](#execution-log--completed-work) at the bottom and in git history; **full rationale** for the program is in [`research/ACTION-PLAN.md`](./research/ACTION-PLAN.md) + the reports under [`research/`](./research/README.md).

---

## Scope

This EPIC changes the **shipped product** (`agents/`, `skills/`, `bin/` CLI kernel) and the **authoring discipline** (`.claude/rules/sk-agent-prompts.md`). The project-vs-product boundary is documented in `AGENTS.md` ("Project vs usage") and `.claude/README.md`. Product changes are consumer-facing — treat with the same care as any shipped change (cover via `smokes/` fixtures).

**Durability filter is an ONGOING check, not a one-time sort.** Scaffolds can flip net-positive→net-negative *silently* across one model generation (agentic-loops: the "Prompting Inversion" — a GPT-4o win becomes a GPT-5 tax). So "build the harness; rent the wording" is re-run/instrumented per model upgrade, not decided once.

---

## The roadmap

### Phase 0 — Foundations & toolchain — ✅ DONE

| ID | Was | Item | Done |
|---|---|---|---|
| **0.1** | E1 | Revise the authoring discipline (`sk-agent-prompts.md`: positive guardrails, density-as-smell, reasoning≠constraint-guarantee, no-self-validation) | 2026-06-09 |
| **0.2** | E2 | Platform-primitives scoping → **ADR-0002** "own the loop, rent the fan-out" | 2026-06-10 |
| **0.3** | E19 | Fan-out seam + capability probe + budget tiers + **pilot** (findings F1–F10) | 2026-06-15 |
| **0.4** | E23 | `/sk-design` two-mode dialogic rework → **ADR-0003** | 2026-06-15 |
| **0.5** | E20 | Tier-0 config-guard hook (narrowed to `.sidekick/config.json`) | 2026-06-16 |
| **0.6** | E3 (part) | Toolchain audit — **4 of 7 role-groups**: Reviewers, Drafters, Skills/orchestrators, Executors | 2026-06-16 |

Backlog (not scheduled): **usage instrumentation** (was E21) ⏸ — operator-facing meta-info, low behaviour-value; the behaviour-changing context signal is `3.4`. See [`backlog/usage-instrumentation.md`](./backlog/usage-instrumentation.md).

### Phase 1 — Finish the audit + clear the coherence debt

The 2026-06-18 drift sweep found the per-slice audits ran one lens (prose-discipline) when the toolchain needs two — **~10 of 24 agents drifted out of sync with the orchestrators** when `0.4` rewrote `/sk-design`. Phase 1 lands a clean, trustworthy baseline before more behaviour-change work goes on top.

| ID | Item | Sources | Deps |
|---|---|---|---|
| **1.1** | **Coherence reconciliation** — fix the ~8 stale-contract agents against the live orchestrators (kill `Step-N` refs, fix the rfc-drafter `complexity` proxy, drop dead synthesis modes + fabricated `duration_ms`, fix the `docs/decisions` path, name both decision-quorum checkers); add a "rewrites reconcile their blast radius" guard to the discipline doc | [`EPIC-STATE.md` §4](./EPIC-STATE.md) (drift sweep) | — |
| **1.2** | **Explorer + pattern-mapper rethink → ADR-0004** — repurpose `sk-explorer` to a repo-grounding / scope-evidence subagent; move scoping (slug, single-vs-group) into `/sk-design`'s dialogue; **folds in F3** (drop the `low\|medium\|high` difficulty bucket for an evidence-grounded signal) | pilot F3; drift sweep; `reasoning-capability` F5; `agentic-loops` (self-assessed difficulty broken) | 1.1 |
| **1.3** | **Research-quality** — F4 (make brief construction explicit, surface briefs, flag thin-repo grounding) + F7 (mark interchangeable specifics as substitutable) on `sk-researcher-{context,decision,impl}` + `sk-research-synthesiser` → completes the **Researchers** group | pilot F4/F7; `reasoning-capability` | — |
| **1.4** | **Rules group (4)** — `sk-{clean-code,typescript,workflow,working-standards}` — positive framing, directive-density-as-smell; feeds Phase 2 | `prompting` | — |
| **1.5** | **Utility (1)** — `sk-branch-precheck`, pilot **F2** (orchestrator offers to *create* the branch, precheck stays read-only) → **toolchain audit complete** | pilot F2 | — |

### Phase 2 — Rule codifications

| ID | Was | Item | Sources | Deps |
|---|---|---|---|---|
| **2.1** | E4 | Codify **"orchestrator owns deliverable writes; subagents return data"** (proven 6×) — scope = what we add on top of the Workflow runtime's plan-in-script-vars | `orchestration` REPORT, `platform-landscape` | 0.2 |
| **2.2** | E5 | Codify **"no parallel writers / default single-agent, justify fan-out"** (single-agent ≥ MAS at matched budget + Data-Processing-Inequality) | `orchestration` (F10), `agentic-loops` (Tran & Kiela) | 0.2 |
| **2.3** | E6 | Research-first **framing pass + bidirectional over-engineering guard + cap-iteration & best-so-far checkpoint** (non-monotonic: looping-to-gate can degrade a correct result; prefer parallel-sample-and-select) | `reasoning-capability` (F4/F5), `agentic-loops` | 0.2; calibration ← **3.1** |

> ### ⟐ CHECKPOINT — before starting Phase 3
> **Decide whether to pull `4.1` (the eval/verification keystone) forward.** It is the layer every downstream item inherits, and ADR-0001 + the EPIC both flag it for early consideration ("weigh pulling forward as soon as `0.2` lands"). The Phase 3 foundations (`3.x`) are valuable but `4.1` may be the higher-leverage next build. **Make this call explicitly here — do not drift past it.** Re-read `research/prior-art.md` (gsd eval layer) + `verification-autonomy/REPORT.md` before deciding.

### Phase 3 — Capability foundations

| ID | Was | Item | Sources | Deps |
|---|---|---|---|---|
| **3.1** | E8 | **Externalize the sizing/routing signal** — the binding weak spot: self-reported confidence is broken (agents predict ~73% success vs ~35% true), yet the when-to-loop / how-big-a-leaf / how-much-process decision rides on it. Pick empirically among conformal-over-N / monitor agent / variance-proxy / escalate. **Unblocks 2.3 calibration + 4.2.** | `agentic-loops` (#1 finding), `context-memory` (self-report refuted) | — |
| **3.2** | E7 | Independent guardrail/output verification (CoVe-style + **seal the gate from the producer** + audit constraint-adherence at high stakes) — reuses existing verifier agents/quorum. Down-payment toward the `4.1` keystone. | `verification-autonomy`, `prompting`, `agentic-loops` | ready |
| **3.3** | E10 | **Navigability layer over markdown memory** (token-level + index/query/compare) — #1 daily-pain fix. Engineered memory underperforms naive long-context (~40%) → keep token-level + add navigation, don't switch to embeddings | `memory` REPORT, `agentic-loops` (AMA-Bench) | — |
| **3.4** | E9 | Forcing-function for context/escalation (hook that triggers compact/handoff/escalate at thresholds; default-escalate on `irreversible ∧ low-confidence`) + structured/verbatim handoff over lossy re-summarization | `context-memory`, `reasoning-capability`, `agentic-loops` | mounts on 0.5 |

### Phase 4 — Keystone + dial

| ID | Was | Item | Sources | Deps |
|---|---|---|---|---|
| **4.1** | E13 | **Verification / eval layer — THE KEYSTONE** (checkpoint candidate to pull forward). Study `gsd-eval-{planner,auditor}` + `nyquist-auditor` + AI-SPEC; design rubric tiering (Code/LLM-judge/Human), producer≠verifier audit, verifier-manufacturing, cross-family, generalise beyond AI-apps; instrument gates for absorption/inversion | `prior-art`, `verification-autonomy`, `agentic-loops` | 0.2; relates 3.2/4.3 |
| **4.2** | E11 | Operator-dial tooling (operator sets effort/autonomy/risk/budget bounds + context-isolation↔handoff balance; model adapts within) | `backlog/operator-dial-tooling.md`, `reasoning-capability` (F6) | **3.1** |
| **4.3** | E12 | Cross-family quorum for high-stakes verification — the gen-verification gap WIDENS with scale; weak verifiers aggregate to strong (Weaver). Needs a non-Anthropic-verifier dependency decision | `backlog/cross-family-quorum.md`, `verification-autonomy`, `agentic-loops` | relates 3.2/4.1 |

### Phase 5 — Deferred (gated)

| ID | Was | Item | Sources | Deps |
|---|---|---|---|---|
| **5.1** | E14 | Episodic / session memory (the missing memory type) | `memory`, `agentic-loops` | 0.2, 3.3 |
| **5.2** | E15 | Memory substrate decision (markdown vs SQLite+FTS5/sqlite-vec vs graph) — do NOT pre-pick | `memory` | 5.1 |
| **5.3** | E16 | Validate-before-persist memory gate (independent check before any memory write; reconcile-not-append; user-editable) | `memory`, `verification-autonomy`, `agentic-loops` | 3.3/5.1/5.2 |
| **5.4** | E17 | MAS dispatch thresholds (calibrate the fan-out value/parallelism bar) — Anthropic's +90.2% is breadth-only, ~80% of variance is token spend. Pilot datapoint: tier gates research *width* but cost is dominated by iteration *depth* | `orchestration` (F11), `agentic-loops`, ADR-0002 | 0.2, 0.3, (E21 data / owed comparison run) |
| **5.5** | E18 | Design-emits-workflow (candidate) — design's deliverable could be an executable workflow whose gates ARE the RFC goals; proceduralize the META, never the OBJECT. Narrowed by ADR-0002 to read-only fan-out | ADR-0002, `platform-landscape`, `agentic-loops` | 4.1, 4.2, 0.2 |
| **5.6** | E22 | Generated enforcement + tier mobility — analyse project/objective → propose per-project hooks/agents/gates; independent calibration before a generated gate binds; intent-anchored regeneration; tier mobility | ADR-0002, `enforcement-surface` (F7–F9), `prior-art` | 4.1, 0.5; relates 3.2/4.2 |

**Research-before-build (not buildable until researched):** CoT faithfulness (gates any auditable decision-trace feature) · Capability-registry / self-knowledge (gates capability-aware escalation) · Track E (does single-agent-under-matched-budget hold on tool-heavy/long-horizon work?) · the fuzzy-goal gate gap (is there any sound gate short of a human for "make this codebase better"?). Live map: [`research/README.md`](./research/README.md).

---

## Crosswalk — legacy `E#` ↔ phase.item

The authoritative mapping. Any `E#` in the ADRs, research, backlog, memory, or commit history resolves here.

| E# | New | E# | New | E# | New |
|---|---|---|---|---|---|
| E1 | 0.1 | E9 | 3.4 | E17 | 5.4 |
| E2 | 0.2 | E10 | 3.3 | E18 | 5.5 |
| E3 | 0.6 + Phase 1¹ | E11 | 4.2 | E19 | 0.3 |
| E4 | 2.1 | E12 | 4.3 | E20 | 0.5 |
| E5 | 2.2 | E13 | 4.1 | E21 | backlog |
| E6 | 2.3 | E14 | 5.1 | E22 | 5.6 |
| E7 | 3.2 | E15 | 5.2 | E23 | 0.4 |
| E8 | 3.1 | E16 | 5.3 | | |

¹ **E3** was a 7-role-group toolchain audit. The 4 completed groups are `0.6`; the remaining work is `1.2`–`1.5` (plus the new `1.1` coherence pass). Commit tags read `[E3]`.

> **Documentation-format gap (noted 2026-06-18).** This crosswalk exists because work-item identity, status, and roadmap ordering have been tracked ad-hoc across EPIC.md + ADRs + backlog + memory with no single format. A proper work-item documentation system is owed — tracked at [`backlog/work-item-doc-format.md`](./backlog/work-item-doc-format.md). Until then: `EPIC.md` is the roadmap, `EPIC-STATE.md` is the live snapshot, this crosswalk is the ID resolver.

---

## E3 audit detail — role-groups & governing research

The toolchain audit (`0.6` + Phase 1) brings each agent role-group up to the revised discipline.

| Group | Files | Governing research | Status |
|---|---|---|---|
| Reviewers/verifiers (9) | the 6 `*-reviewer`s + `goal-verifier` + `structural`/`crossref-checker` (+ new `coherence-checker`) | `verification-autonomy` + `prompting` + `agentic-loops` (self-verification net-negative; seal the gate) | ✅ `0.6` |
| Drafters/planners (5) | `plan-drafter`, `plan-reconciler`, `decision-drafter`, `rfc-drafter`, `architectural-advisor` | `prompting` + `reasoning-capability` | ✅ `0.6` |
| Skills/orchestrators (6) | `sk-{build,decide,design,goal-verify,regen-plan,review}` | `orchestration` + `reasoning-capability` + `prompting` + `agentic-loops` | ✅ `0.6` |
| Executors (2) | `executor`, `fixer` | `orchestration` + `agentic-loops` | ✅ `0.6` |
| Researchers (6) | `researcher-{context,decision,impl}`, `research-synthesiser`, `explorer`, `pattern-mapper` | `reasoning-capability` (framing-first, bidirectional dial) + `agentic-loops` (sizing self-assessment is broken) | → `1.2`/`1.3` |
| Rules (4) | `sk-{clean-code,typescript,workflow,working-standards}` | `prompting` | → `1.4` |
| Utility (1) | `sk-branch-precheck` | (light) — pilot F2 | → `1.5` |

**Pilot (`0.3`) inputs** (see [`backlog/platform-primitives-scoping.md`](./backlog/platform-primitives-scoping.md) F1–F10): Researchers ← F3 (`1.2`), F4 + F7 (`1.3`); Utility ← F2 (`1.5`); the orchestrator dialogue rework F5/F9 was ADR-0003/`0.4`.

**E23-smoke + 2026-06-18 drift inputs:** the `0.4` rewrite (numbered Steps → named phases; removed `--research`/`--no-research`/`--budget`; research decoupled from complexity; renamed RFC sections) moved the ground under the agents `/sk-design` dispatches without reconciling them → the `1.1` coherence pass. Full list in [`EPIC-STATE.md` §4](./EPIC-STATE.md).

---

## Prior art (gsd) — study before building

[`research/prior-art.md`](./research/prior-art.md): memory chain (`3.3`/`5.1`/`5.2`) → `gsd-graphify` + `gsd-thread` + pause/resume handoff; eval keystone (`4.1`) → `gsd-eval-{planner,auditor}` + `nyquist-auditor` + AI-SPEC. gsd has built credible versions of our two stated blind spots — borrow, don't reinvent. Shared gap to add on top: **cross-family** verification (`4.3`).

---

## Execution log — completed work

Detailed slice records (preserved). Legacy `E#` resolve via the crosswalk.

**`0.1` (E1) — discipline revision — 2026-06-09 (`3c5a340`).** Applied the 6 surgical edits to `sk-agent-prompts.md` (positive guardrails; ">10" as a smell; few-shot model-dependent; "reasoning ≠ constraint-guarantee"; model-dependence; directive-priority) + reinforced no-self-validation with hard evidence (self-verification is net-NEGATIVE; the gate must be a *different* invocation than the worker).

**`0.2` (E2) — platform scoping → ADR-0002 — 2026-06-10 (`d19ee68`, accepted `4641c89`).** "Own the loop, rent the fan-out": write-path loop stays hand-rolled and shrinks; read-only breadth fan-out rents Workflow behind a seam + probe + budget tiers; hooks are the tier-0 deterministic base; `/goal`/`/loop` ignored as substrates. Spawned `0.3`/`0.5`/(E21)/`5.6`; reframed `5.4`/`5.5`. Research: `platform-coupling/` + `enforcement-surface/`.

**`0.3` (E19) — fan-out seam + pilot — 2026-06-15.** Tasks 1–6 (`60deab4`..`a38de77`): `sidekick capabilities` probe; `fanout: { backend, budget }` config; backend seam in skills; consumer onboarding + LIMITS docs. Pilot (2 runs, separate game project) validated the workflow backend end-to-end and produced canonical findings **F1–F10**. Also fixed a high-sev install bug (`install-esm-module-resolution.md`, `ef4f1fa`). Routing: F1 → standalone backlog · F2/F3/F4/F5/F7 → audit · F6/F8 → `5.4` · F9 → ADR-0003/`0.4`.

**`0.4` (E23) — sk-design dialogue rework → ADR-0003 — 2026-06-15 (`f8fe3f2`..`5d8a56d`).** `/sk-design` restructured into **dialogue-by-default** + **`--auto <low|medium|high>`** hands-off; old flags `--research`/`--no-research`/`--budget` removed; complexity made a surfaced signal, not a gate. Net −101 lines (13-step state machine → two affordance bodies + shared Finalisation); dispatcher I/O contracts verified byte-identical; gate green. *This rewrite is the root cause of the Phase 1 coherence debt — see `1.1`.*

**`0.5` (E20) — tier-0 config-guard hook — 2026-06-16 (`f04d962`..`e5f2fb1`).** PreToolUse deny on agent `Edit`/`Write`/`MultiEdit` to `.sidekick/config.json` + non-blocking Stop advisory for the Bash-write channel. Logic in tested TS behind `sidekick hook guard-config`/`scan-config`; installed opt-in by `sidekick init` (`--no-hooks`) into per-user gitignored `.claude/settings.local.json` (idempotent, foreign-hook-preserving). Substrate for `3.4` + (E21). Smoke 12 passed.

**`0.6` (E3, 4 of 7 groups) — toolchain audit — 2026-06-16.**
- *Reviewers/verifiers* (`24c4b41`..`fd159f1`): new `sk-coherence-checker` (`rfc|plan|decision`) — the semantic-contradiction dimension; wired RFC-first into three parallel quorums (RFC + PLAN in sk-design, decision in sk-decide). F1 unused-tool drops; F2 numbered-workflow→prose; sealing clean across all 9. Sealed producer≠verifier pass: no Criticals.
- *Drafters/planners* (`bfef312`..`361c03e`): `sk-rfc-drafter` rewritten so `## Architecture` describes the *decided* design — **one-directional authority** (the decision outranks every agent incl. the coherence checker; reconcile Decision→Architecture, never reverse). F1 tool drops + `Al-`→`sk-` typo + role-line fix + advisor F2 nit. Sealed pass: no Criticals; one Major resolved (`e85a99c`).
- *Skills/orchestrators* (`d3b1bda`..`a2c87c0`): ISO-date fix end-to-end; sk-decide cross-RFC coherence via `source_rfc` boundary signal; sk-design divergence reconcile-step (gate-quality/anti-rubber-stamp); sealing-legibility; sk-build shrink = `classify-deviation` CLI helper (Q1 heuristics → kernel) + examples 4→3. Sealed pass: no Criticals; 2 pre-existing Majors surfaced.
- *Executors* (`2177765`..`10d9533`): `sk-executor` stale step-pins → role-relationship language; `sk-fixer` Bash dropped (structural no-git/no-test enforcement) + F2. Inline (no sealed review — proportionate). Backlogged the `pnpm` gate default (`gate-command-defaults.md`).

**`1.1` — coherence reconciliation — 2026-06-18.** Reconciled the ~10-agent drift the 2026-06-18 sweep surfaced ([`EPIC-STATE.md` §4](./EPIC-STATE.md)), against the live orchestrators **and the tested CLI kernel**. Killed `Step-N` / `Researchers-T-08` refs (role-relationship language); fixed rfc-drafter's Research-notes proxy (keys off `synthesis_output`, not `complexity: low`); dropped the dead `synthesis_target` modes + the fabricated `duration_ms` telemetry; fixed `docs/decisions/` → `.sidekick/decisions/`; named both decision-quorum checkers; per the Q2 call, removed `short_synthesis` and reduced the RFC `## Research notes` to a pointer (synthesis lives only in RESEARCH.md). Added the "rewrites reconcile their blast radius" guard to `.claude/rules/sk-agent-prompts.md`. **Two sweep corrections:** the `pins-rfc` hash item was *backwards* — the tested CLI computes SHA-256, so the bug was `/sk-design` using `git hash-object` (a **functional** perpetual-drift bug, not cosmetic), now aligned to SHA-256 across all four sites; and the sweep under-counted (`docs/decisions/` also in `sk-executor`; `## Comparative analysis` also in `sk-build`). **New finding parked for `1.2`:** the redesign re-entry path is broken — `/sk-design --resume` (sk-goal-verify) and `/sk-design <slug>` (sk-build) are both rejected by sk-design's current contract.

**Testing posture (operator, 2026-06-16):** live integration smokes (Smoke 13/14/15 Parts B–D) and per-slice prompt-fixture smokes are **batched into one end-of-audit session** — the subagent registry snapshots at session start, so a newly-added agent *type* isn't dispatchable mid-session. Don't run them per-slice.
