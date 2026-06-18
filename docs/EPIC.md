# EPIC — Apply the research learnings to the harness

> **North-star.** Sidekick is an **oversight harness** for AI-assisted engineering — it owns the loop (research → design → build → verify), the gates, the verification, and the escalation, and *rents* the wording. This EPIC applies the research program's learnings to that harness. The durability filter on every item: **build the oversight harness; rent the wording** — own the structure, treat specific prompt phrasings as rentable and re-checkable per model generation. The aim is a harness that gets **more** reliable as the underlying models improve, not one that becomes a tax on them.

**Status (2026-06-18):** Architecture settled (ADR-0001/0002/0003/0004 — ADR-0004 *accepted 2026-06-18*: loop identity + redesign re-entry + the autonomy seam, implemented by `1.2`). Toolchain built and working (6 skills + 23 agents + 9 CLI helpers + tier-0 hook). **Phase 0 complete**; **Phase 1 in progress** — `1.1`–`1.4` done 2026-06-18; `1.5`–`1.6` remain. **Re-baselined 2026-06-18** (foundations-then-memory: eval keystone pulled forward into Phase 3; memory consolidated into a dedicated Phase 4; Rules group dropped). Phases 2–5 unstarted. Live state snapshot: [`EPIC-STATE.md`](./EPIC-STATE.md).

---

## How to read this roadmap

- **IDs are `{phase}.{item}` and the number encodes intended execution order.** `3.1` comes before `3.2`; Phase 2 comes before Phase 3. This replaces the old `E#` priority numbers + tiers, which carried no order (and accumulated a confusing renumbering map).
- **Stability rule — append, never renumber** *within a baseline*. A new item joins its phase at the next free number; items keep their ID for the life of the baseline. A **re-baseline** — a deliberate, logged re-sequencing of phases — is the rare exception; there have been two (`E#`→phase.item, then this foundations-then-memory cut, both 2026-06-18), each carrying an old→new crosswalk. Renumber deliberately, never casually.
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

Backlog at Phase 0 close: **usage instrumentation** (was E21) is no longer a deferred nicety — it has been **promoted to `3.8`** (cost + gate-absorption observability), because the durability filter needs a *mechanism* to detect a flipped scaffold, not just an intent.

> **Re-baseline 2 (2026-06-18).** This roadmap was re-sequenced to match what got built and the operator's stated order — *foundations (workflow · agents · rubric · quorum) first, then memory as a dedicated focus.* Three load-bearing moves: the **eval/rubric keystone was pulled forward** into the foundations (Phase 3, now `3.4`); **all memory work was consolidated** from the old `3.3` + `5.x` spread into a dedicated **Phase 4**; the **Rules-group item was dropped** (rules are being retired — the need it stood for becomes the per-project generated-gates capability, `5.1`). Old→new in the [Crosswalk](#crosswalk--legacy-e--phaseitem). The review that drove this respec is the 2026-06-18 whole-architecture pass.

### Phase 1 — Coherence, consistency & the broken loop  ← current

`1.1` cleared the agent drift the 2026-06-18 sweep found (`0.4`'s `/sk-design` rewrite moved the ground under the agents it dispatches). The rest of Phase 1 finishes the audit, fixes the cross-cutting inconsistencies the whole-architecture review surfaced, and repairs the design↔build loop that rewrite broke — a clean, trustworthy baseline before behaviour-change work.

| ID | Item | Sources | Deps |
|---|---|---|---|
| **1.1** ✅ | **Coherence reconciliation** — agent drift vs the live orchestrators + tested kernel; "rewrites reconcile their blast radius" guard. Done 2026-06-18. | [`EPIC-STATE.md` §4](./EPIC-STATE.md) | — |
| **1.2** ✅ | **Implement ADR-0004 — loop identity + redesign re-entry.** Identity becomes a *derived* output (slug derived-and-confirmed in the dialogue, no longer a required input); an existing plan is *re-entry*, not `slug_collision`; redesign re-enters dialogic `/sk-design` seeded by the **sealed externalized trigger** (`classify-deviation` / `sk-goal-verifier`), appending an `## Redesigns` `R-NN` block, capped + best-so-far. `sk-explorer` **dissolves** (scoping → dialogue; collision → re-entry); **F3 dropped** — the `low\|medium\|high` self-rating is the unreliable-self-sizing anti-signal (at most an overridable soft prior under an operator cap, per F6). The autonomy-dial is *seamed* by ADR-0004 (every transition rides a sealed gate; design owns "what", not "how-autonomously") but **built later** (`3.5`/`3.3`). Done 2026-06-18. | ADR-0004; review §loop/§best-in-class; `agentic-loops`; `reasoning-capability` F3/F6 | 1.1 |
| **1.3** ✅ | **Research-quality** — F4 (explicit brief construction, surface briefs, flag thin-repo grounding) + F7 (mark interchangeable specifics substitutable) on `sk-researcher-{context,decision,impl}` + `sk-research-synthesiser`. F4's thin-repo grounding is satisfied by the cached codebase-map (`4.5`) — cross-reference, don't duplicate. → completes the **Researchers** group. Done 2026-06-18. | pilot F4/F7 | — |
| **1.4** ✅ | **Branch-precheck (F2) + consolidate the agent/CLI split** — orchestrator offers to *create* the branch (precheck stays read-only); and resolve the inconsistency that 4 skills dispatch the `sk-branch-precheck` agent while `sk-decide` calls the CLI directly. Done 2026-06-18: the `sk-branch-precheck` agent is **retired**; all five orchestrators call the `branch-precheck` CLI directly; `/sk-design` now offers **create-and-continue** (`git switch -c feat/<slug>`) on `propose_branch` instead of clean-exiting with a hint (F2). → **toolchain audit complete**. | pilot F2; review §inconsistencies | — |
| **1.5** | **Consistency cleanup sweep** — the cross-cutting smells the review found: verdict-matrix duplicated verbatim in `/sk-review` ↔ `/sk-goal-verify` (extract one source); `commands/` vestige in `cli.ts` `MANAGED_DIRS`; registry-vs-file tool-list drift; the `claude-code-workflows:architect-review` external ref in `sk-architectural-advisor`. | review §inconsistencies | — |
| **1.6** | **Shared pin-hash CLI subcommand** (`sidekick hash-rfc <slug>`) — one implementation that `/sk-design`, `sk-crossref-checker`, and `check-drift` all call, so "everyone computes the pin the same way" stops being a prose promise. Structurally prevents the `1.1` SHA-1/SHA-256 bug class. | review §missing-tools | — |

> **Owed action (not an item): run the batched integration smokes** (Smoke 13/14/15). The `1.1` SHA bug — a load-bearing integrity check silently inverted, undetected because the smokes are unrun — is the standing proof that the verification rigour is itself unverified. Cheapest high-value step on the board.

### Phase 2 — Codified patterns

| ID | Was | Item | Sources | Deps |
|---|---|---|---|---|
| **2.1** | E4 | Codify **"orchestrator owns deliverable writes; subagents return data"** (proven 6×). | `orchestration`, `platform-landscape` | 0.2 |
| **2.2** | E5 | Codify **"no parallel writers / default single-agent, justify fan-out"** (single-agent ≥ MAS at matched budget + DPI). | `orchestration` (F10), `agentic-loops` | 0.2 |
| **2.3** | E6 | Research-first **framing pass + bidirectional over-engineering guard + cap-iteration & best-so-far checkpoint** (non-monotonic: looping-to-gate can degrade a correct result; prefer parallel-sample-and-select). | `reasoning-capability` (F4/F5), `agentic-loops` | 0.2; calibration ← **3.1** |

> The old Phase 2→3 checkpoint ("pull the eval keystone forward?") is **decided: yes** — it is `3.4`, a Phase 3 foundation, per ADR-0001 and the operator's foundations-before-memory sequencing. No standalone checkpoint remains.

### Phase 3 — Verification & capability foundations

*The "rubric + quorum + dials" the operator named as the prerequisites for memory. Eval (`3.4`) is the pulled-forward keystone.*

| ID | Was | Item | Sources | Deps |
|---|---|---|---|---|
| **3.1** | E8 | **Externalize the sizing/routing signal** — self-confidence is broken (~73% predicted vs ~35% true) yet when-to-loop / how-big-a-leaf rides on it. Pick empirically: conformal-over-N / monitor agent / variance-proxy / escalate. | `agentic-loops` (#1), `context-memory` | — |
| **3.2** | E7 | **Independent guardrail/output verification** (CoVe-style + seal the gate from the producer + audit constraint-adherence at high stakes) — reuses the existing quorum. **This is the machinery Phase 4's memory write-gate reuses.** | `verification-autonomy`, `prompting`, `agentic-loops` | ready |
| **3.3** | E9 | **Forcing-function for context/escalation** — a hook that *triggers* compact/handoff/escalate at thresholds (not "surface the number and hope"); default-escalate on `irreversible ∧ low-confidence`; structured/verbatim handoff over lossy re-summarization. Fold in a **durable mid-dialogue interrupt** (LangGraph `interrupt/resume` shape) for `/sk-design` and a **condenser-style** compaction (OpenHands). | `context-memory`, `agentic-loops`; review §best-in-class | mounts on 0.5 |
| **3.4** | E13 | **EVAL / RUBRIC LAYER — THE KEYSTONE** (pulled forward). Port gsd's blueprint — AI-SPEC contract → `eval-planner` (`system_type`→dimensions) → `eval-auditor` (COVERED/PARTIAL/MISSING) → Nyquist-style verifier-manufacturing; Code/LLM-judge/Human tiering — **but keep it SEALED (gsd's auditor isn't).** Fold in **EARS-style testable goals**, gsd's **`must_haves` (truths/artifacts/key_links) in PLAN frontmatter**, and **gate-absorption/inversion instrumentation** (the durability filter needs a mechanism). Generalise beyond AI-apps. **Unblocks `3.7`, Phase 4, `5.1`.** | `prior-art`, `verification-autonomy`, `agentic-loops`; review §best-in-class | 0.2; relates 3.2/3.6 |
| **3.5** | E11 | **Operator-dial** — operator sets effort/autonomy/risk/budget bounds + isolation↔handoff balance; model adapts within. Partial today (`--auto`, `fanout.budget`). | `reasoning-capability` (F6), `backlog/operator-dial-tooling.md` | 3.1 |
| **3.6** | E12 | **Cross-family quorum** for high-stakes verification — all-Claude quorum is structurally compromised + capped (~60% self-consistent-error correlation); gen-verification gap *widens* with scale (Weaver). gsd's `plan-review-convergence` ships cross-AI as proof. Needs the non-Anthropic-verifier dependency decision. | `verification-autonomy`, `agentic-loops`, `backlog/cross-family-quorum.md` | relates 3.2/3.4 |
| **3.7** | — | **Eval-gated zoo reduction** — *after* `3.4` can measure it (ADR-0001: thin with evidence, never by taste): merge/retire the over-decomposed agents the review flagged — the `sk-structural-checker`→CLI candidate, the near-deterministic 3-way RFC/PLAN quorum split (the `sk-branch-precheck` agent was already retired in `1.4`) — per Rule 5 (dimensional, not artifact-bound). The drift sweep (~10/24 agents drifted from one change) is the evidence the boundary count is a coherence tax. | ADR-0001, `agentic-loops` (DPI), review §useless-agents | 3.4 |
| **3.8** | E21 | **Cost + gate-absorption observability** (promoted from backlog) — real per-run token/cost readout (`deep` can cost millions) + gate-outcome logging so a scaffold that flipped net-negative is *detectable*. The durability filter's missing instrument. | ADR-0002 §7, review §observability | relates 3.4 |

### Phase 4 — Memory  *(the consolidated, exclusive focus — after the foundations)*

The long-standing sore point gets its own phase instead of the old `3.3` + `5.x` spread. **Hard-depends on `3.2` + `3.4`** (the write-gate is producer≠verifier applied to a memory write; eval lets you measure whether memory actually helps) — so it can start as soon as those land, not necessarily after *all* of Phase 3. Guardrails from the research: engineered memory underperforms naive long-context (~40%) → keep token-level + navigation, don't reach for embeddings reflexively; **user-editable, never silently agent-editable.**

| ID | Was | Item | Sources | Deps |
|---|---|---|---|---|
| **4.1** | E10 | **Navigability layer over token-level memory** (index/query/compare) — the #1 daily-pain fix; *build first*. gsd-graphify (confidence-tiered graph + query) is the prior art. | `memory`, `agentic-loops` | — |
| **4.2** | E16 | **Validate-before-persist gate** — independent check before any write; reconcile-not-append; user-editable-not-silently-agent-editable. **Keep it SEALED** (gsd persists memory without a gate — this is the differentiator). | `memory`, `verification-autonomy` | 3.2, 3.4, 4.1 |
| **4.3** | E14 | **Episodic / session memory** — the missing memory type (cross-session "what happened"). Steal Devin's **Knowledge** (trigger-retrieved facts) + **Playbooks** (reusable procedures) split. | `memory`, `agentic-loops`; review §best-in-class | 4.1 |
| **4.4** | E15 | **Memory substrate decision** (markdown vs SQLite+FTS5/sqlite-vec vs graph) — do NOT pre-pick; resolve with a focused spike. | `memory` | 4.3 |
| **4.5** | — | **Precomputed codebase-map artifact** — a cached repo model (STACK/ARCH/CONVENTIONS/…) written once, reused per design run; *semantic memory of the repo*. Kills the `sk-pattern-mapper` silent-miss class; satisfies `1.3`'s F4 thin-repo grounding. | review §best-in-class (Aider repo-map, gsd map-codebase, Devin Wiki) | 4.1 |

### Phase 5 — Generative / advanced (gated)

| ID | Was | Item | Sources | Deps |
|---|---|---|---|---|
| **5.1** | E22 | **Generated enforcement + per-project gate helpers** — analyse project/objective → **identify and help author the quality gates that should hold on the *target* repo** (the recovered "helpers to create gates on the target project" thread); agents like `sk-maintainability-reviewer` then enforce *those* project gates instead of sidekick's bespoke rules (the retired Rules group was the seed/demonstration of this pattern). Independent calibration before a generated gate binds (producer≠verifier recurses); intent-anchored regeneration on drift; anti-mock + integration dimensions; tier mobility. | ADR-0002 §5, `enforcement-surface` (F7–F9), `prior-art` | 3.4, 0.5; relates 3.2/3.5 |
| **5.2** | E18 | **Design-emits-workflow** (candidate) — design's deliverable could be an executable workflow whose gates ARE the RFC goals; proceduralize the META, never the OBJECT. Narrowed by ADR-0002 to read-only fan-out. | ADR-0002, `platform-landscape`, `agentic-loops` | 3.4, 3.5, 0.2 |
| **5.3** | E17 | **MAS dispatch thresholds** — calibrate the fan-out value/parallelism bar; ~80% of MAS-win variance is token spend. Needs `3.8` cost data. | `orchestration` (F11), `agentic-loops`, ADR-0002 | 0.2, 0.3, 3.8 |

**Research-before-build (not buildable until researched):** CoT faithfulness (gates any auditable decision-trace feature) · capability-registry / self-knowledge (gates capability-aware escalation) · Track E (does single-agent-under-matched-budget hold on tool-heavy/long-horizon work?) · the fuzzy-goal gate gap (is there any sound gate short of a human for "make this codebase better"?). Live map: [`research/README.md`](./research/README.md).

**Homed in backlog (not scheduled):** UI design/review dimension (the ui-audit gap; gsd-ui-review) · pre-write syntax guardrail in `sk-executor` (SWE-agent edit linter) · deterministic contradiction/ambiguity linter to augment `sk-coherence-checker` (Kiro SMT/semantic-entropy — a durable kernel primitive) · persist-research-plan-before-fan-out (Anthropic pattern) · work-item-doc-format (the meta-gap, still owed).

---

## Crosswalk — legacy `E#` ↔ phase.item

The authoritative mapping (E# → this re-baseline). Any `E#` in the ADRs, research, backlog, memory, or commit history resolves here.

| E# | New | E# | New | E# | New |
|---|---|---|---|---|---|
| E1 | 0.1 | E9 | 3.3 | E17 | 5.3 |
| E2 | 0.2 | E10 | 4.1 | E18 | 5.2 |
| E3 | 0.6 + Phase 1¹ | E11 | 3.5 | E19 | 0.3 |
| E4 | 2.1 | E12 | 3.6 | E20 | 0.5 |
| E5 | 2.2 | E13 | 3.4 | E21 | 3.8 |
| E6 | 2.3 | E14 | 4.3 | E22 | 5.1 |
| E7 | 3.2 | E15 | 4.4 | E23 | 0.4 |
| E8 | 3.1 | E16 | 4.2 | | |

¹ **E3** was a 7-role-group toolchain audit. The 4 completed groups are `0.6`; the remaining audit work is `1.2`–`1.4` (plus the `1.1` coherence pass). Commit tags read `[E3]`.

**Re-baseline 2 delta** (first phase.item cut → this foundations-then-memory cut). Load-bearing moves: eval keystone `4.1→3.4` (pulled forward); operator-dial `4.2→3.5`; cross-family `4.3→3.6`; forcing-function `3.4→3.3`; navigability memory `3.3→4.1`; validate-before-persist `5.3→4.2`; episodic `5.1→4.3`; substrate `5.2→4.4`; MAS-thresholds `5.4→5.3`; design-emits `5.5→5.2`; generated-enforcement `5.6→5.1`; branch-precheck `1.5→1.4`. **Dropped:** Rules group (old `1.4`) — rules retired; the need becomes `5.1`. **New:** `1.5` (consistency cleanup), `1.6` (pin-hash CLI), `3.7` (zoo reduction), `3.8` (observability, was E21-backlog), `4.5` (codebase-map). **Unchanged:** `0.x`, `1.1`–`1.3`, `2.x`, `3.1`, `3.2`.

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
| Researchers (6) | `researcher-{context,decision,impl}`, `research-synthesiser`, `explorer`, `pattern-mapper` | `reasoning-capability` (framing-first, bidirectional dial) + `agentic-loops` (sizing self-assessment is broken) | ✅ `1.2`/`1.3` |
| ~~Rules (4)~~ | ~~`sk-{clean-code,typescript,workflow,working-standards}`~~ | — | **dropped** — rules retired; the need they stood for → `5.1` (per-project generated gates) |
| ~~Utility (1)~~ | ~~`sk-branch-precheck`~~ | (light) — pilot F2 | ✅ `1.4` — **retired** (agent→CLI) + F2 landed |

**Pilot (`0.3`) inputs** (see [`backlog/platform-primitives-scoping.md`](./backlog/platform-primitives-scoping.md) F1–F10): Researchers ← F3 (`1.2`), F4 + F7 (`1.3`); Utility ← F2 (`1.4`); the orchestrator dialogue rework F5/F9 was ADR-0003/`0.4`.

**E23-smoke + 2026-06-18 drift inputs:** the `0.4` rewrite (numbered Steps → named phases; removed `--research`/`--no-research`/`--budget`; research decoupled from complexity; renamed RFC sections) moved the ground under the agents `/sk-design` dispatches without reconciling them → the `1.1` coherence pass. Full list in [`EPIC-STATE.md` §4](./EPIC-STATE.md).

---

## Prior art (gsd) — study before building

[`research/prior-art.md`](./research/prior-art.md): memory phase (`4.1`/`4.3`/`4.4`/`4.5`) → `gsd-graphify` + `gsd-thread` + `gsd-map-codebase` + pause/resume handoff (also Devin Knowledge/Playbooks, Aider repo-map); eval keystone (`3.4`) → `gsd-eval-{planner,auditor}` + `nyquist-auditor` + AI-SPEC (**keep it sealed — gsd's auditor isn't**). gsd has built credible versions of our two stated blind spots — borrow, don't reinvent. Shared gap to add on top: **cross-family** verification (`3.6`).

---

## Execution log — completed work

Detailed slice records (preserved). Legacy `E#` resolve via the crosswalk.

**`0.1` (E1) — discipline revision — 2026-06-09 (`3c5a340`).** Applied the 6 surgical edits to `sk-agent-prompts.md` (positive guardrails; ">10" as a smell; few-shot model-dependent; "reasoning ≠ constraint-guarantee"; model-dependence; directive-priority) + reinforced no-self-validation with hard evidence (self-verification is net-NEGATIVE; the gate must be a *different* invocation than the worker).

**`0.2` (E2) — platform scoping → ADR-0002 — 2026-06-10 (`d19ee68`, accepted `4641c89`).** "Own the loop, rent the fan-out": write-path loop stays hand-rolled and shrinks; read-only breadth fan-out rents Workflow behind a seam + probe + budget tiers; hooks are the tier-0 deterministic base; `/goal`/`/loop` ignored as substrates. Spawned `0.3`/`0.5`/`3.8`/`5.1`; reframed `5.3`/`5.2` (v2 IDs). Research: `platform-coupling/` + `enforcement-surface/`.

**`0.3` (E19) — fan-out seam + pilot — 2026-06-15.** Tasks 1–6 (`60deab4`..`a38de77`): `sidekick capabilities` probe; `fanout: { backend, budget }` config; backend seam in skills; consumer onboarding + LIMITS docs. Pilot (2 runs, separate game project) validated the workflow backend end-to-end and produced canonical findings **F1–F10**. Also fixed a high-sev install bug (`install-esm-module-resolution.md`, `ef4f1fa`). Routing: F1 → standalone backlog · F2/F3/F4/F5/F7 → audit · F6/F8 → `5.3` · F9 → ADR-0003/`0.4`.

**`0.4` (E23) — sk-design dialogue rework → ADR-0003 — 2026-06-15 (`f8fe3f2`..`5d8a56d`).** `/sk-design` restructured into **dialogue-by-default** + **`--auto <low|medium|high>`** hands-off; old flags `--research`/`--no-research`/`--budget` removed; complexity made a surfaced signal, not a gate. Net −101 lines (13-step state machine → two affordance bodies + shared Finalisation); dispatcher I/O contracts verified byte-identical; gate green. *This rewrite is the root cause of the Phase 1 coherence debt — see `1.1`.*

**`0.5` (E20) — tier-0 config-guard hook — 2026-06-16 (`f04d962`..`e5f2fb1`).** PreToolUse deny on agent `Edit`/`Write`/`MultiEdit` to `.sidekick/config.json` + non-blocking Stop advisory for the Bash-write channel. Logic in tested TS behind `sidekick hook guard-config`/`scan-config`; installed opt-in by `sidekick init` (`--no-hooks`) into per-user gitignored `.claude/settings.local.json` (idempotent, foreign-hook-preserving). Substrate for `3.4` + (E21). Smoke 12 passed.

**`0.6` (E3, 4 of 7 groups) — toolchain audit — 2026-06-16.**
- *Reviewers/verifiers* (`24c4b41`..`fd159f1`): new `sk-coherence-checker` (`rfc|plan|decision`) — the semantic-contradiction dimension; wired RFC-first into three parallel quorums (RFC + PLAN in sk-design, decision in sk-decide). F1 unused-tool drops; F2 numbered-workflow→prose; sealing clean across all 9. Sealed producer≠verifier pass: no Criticals.
- *Drafters/planners* (`bfef312`..`361c03e`): `sk-rfc-drafter` rewritten so `## Architecture` describes the *decided* design — **one-directional authority** (the decision outranks every agent incl. the coherence checker; reconcile Decision→Architecture, never reverse). F1 tool drops + `Al-`→`sk-` typo + role-line fix + advisor F2 nit. Sealed pass: no Criticals; one Major resolved (`e85a99c`).
- *Skills/orchestrators* (`d3b1bda`..`a2c87c0`): ISO-date fix end-to-end; sk-decide cross-RFC coherence via `source_rfc` boundary signal; sk-design divergence reconcile-step (gate-quality/anti-rubber-stamp); sealing-legibility; sk-build shrink = `classify-deviation` CLI helper (Q1 heuristics → kernel) + examples 4→3. Sealed pass: no Criticals; 2 pre-existing Majors surfaced.
- *Executors* (`2177765`..`10d9533`): `sk-executor` stale step-pins → role-relationship language; `sk-fixer` Bash dropped (structural no-git/no-test enforcement) + F2. Inline (no sealed review — proportionate). Backlogged the `pnpm` gate default (`gate-command-defaults.md`).

**`1.1` — coherence reconciliation — 2026-06-18.** Reconciled the ~10-agent drift the 2026-06-18 sweep surfaced ([`EPIC-STATE.md` §4](./EPIC-STATE.md)), against the live orchestrators **and the tested CLI kernel**. Killed `Step-N` / `Researchers-T-08` refs (role-relationship language); fixed rfc-drafter's Research-notes proxy (keys off `synthesis_output`, not `complexity: low`); dropped the dead `synthesis_target` modes + the fabricated `duration_ms` telemetry; fixed `docs/decisions/` → `.sidekick/decisions/`; named both decision-quorum checkers; per the Q2 call, removed `short_synthesis` and reduced the RFC `## Research notes` to a pointer (synthesis lives only in RESEARCH.md). Added the "rewrites reconcile their blast radius" guard to `.claude/rules/sk-agent-prompts.md`. **Two sweep corrections:** the `pins-rfc` hash item was *backwards* — the tested CLI computes SHA-256, so the bug was `/sk-design` using `git hash-object` (a **functional** perpetual-drift bug, not cosmetic), now aligned to SHA-256 across all four sites; and the sweep under-counted (`docs/decisions/` also in `sk-executor`; `## Comparative analysis` also in `sk-build`). **New finding parked for `1.2`:** the redesign re-entry path is broken — `/sk-design --resume` (sk-goal-verify) and `/sk-design <slug>` (sk-build) are both rejected by sk-design's current contract.

**`1.2` — loop identity + redesign re-entry (ADR-0004) — 2026-06-18.** Implemented accepted ADR-0004 as one atomic 5-file change. Identity is now a *derived* output (slug derived-and-confirmed in the dialogue; an existing plan is *re-entry*, not `slug_collision`); redesign re-enters dialogic `/sk-design` seeded by the sealed externalized trigger (`classify-deviation` / `sk-goal-verifier`), appending `## Redesigns` R-NN and re-pinning PLAN — user-driven/uncapped, reusing the existing quorum. `sk-explorer` repurposed scoper→repo-grounding/scope-evidence (returns analogues / prior-decisions / libraries / `scope_signal` / `research_hints`; no slug, tier, or gate; tools narrowed to `Read, Grep, Glob`). **F3 dropped** — the dead `complexity` input also removed from `sk-rfc-drafter` (the tail `1.1` deferred here). `/sk-goal-verify`'s `--resume` route and `/sk-build`'s redesign prompts now resolve to the working `/sk-design <slug>`; `--resume` is explicitly rejected so it can't mis-parse as a topic. Autonomy-dial **seamed only** (built later at `3.5`/`3.3`; ADR-0004 supersedes ADR-0003's `--auto`-as-mode). Coherence sweep clean (no live `--resume`/`slug_collision`/`group_created`/`invalid_complexity`; explorer↔design contract matches field-for-field; no agent cites a "Step N"). Integration smokes batched with the owed set.

**`1.3` — research-quality (F4/F7) — 2026-06-18.** Completed the **Researchers** group. Added to `sk-researcher-{impl,decision,context}`: open `output` with a one-line restatement of the brief (so what was researched is surfaceable in RESEARCH.md); flag thin repo grounding (sparse `CLAUDE.md`/rules/decisions → findings marked generic / lower-confidence rather than presented as fully grounded — the *durable* fix is the `4.5` codebase-map, cross-referenced not duplicated); and mark interchangeable specifics as substitutable (load-bearing *direction* vs rentable *specific* — the `mulberry32`-vs-`sfc32` detail-drift F7 named). `sk-research-synthesiser` now preserves both signals (won't freeze a substitutable specific or inflate thin-grounded findings). Folded into `output` content only — the `{name, output, sources_cited}` / `{full_synthesis}` boundary schemas are untouched, so no contract drift into `/sk-design`. (The group's other two — `sk-explorer`, `sk-pattern-mapper` — were handled in `1.2` and the `1.1` sweep.)

**Testing posture (operator, 2026-06-16):** live integration smokes (Smoke 13/14/15 Parts B–D) and per-slice prompt-fixture smokes are **batched into one end-of-audit session** — the subagent registry snapshots at session start, so a newly-added agent *type* isn't dispatchable mid-session. Don't run them per-slice.
