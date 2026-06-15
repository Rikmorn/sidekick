# EPIC — Apply the research learnings to the harness

**Status:** In progress — **E1 + E2 + E19 done** (E1 2026-06-09 `3c5a340`; E2/ADR-0002 2026-06-10; E19 fan-out seam + pilot 2026-06-15); the rest unstarted. **Each item below is its own future planning session.** Tiers = priority; **IDs now ascend with intended execution order** (renumbered 2026-06-07). **Sources** link the research that justifies each item; **Deps** note prerequisites.

**Scope:** this epic changes the **shipped product** (`agents/`, `skills/`, `rules/`) and the **authoring discipline** (`.claude/rules/sk-agent-prompts.md`). The project-vs-product boundary is already documented in `AGENTS.md` ("Project vs usage") and `.claude/README.md`. Product changes are consumer-facing — treat with the same care as any shipped change (cover via `smokes/` fixtures).

**Rationale & full detail:** [`research/ACTION-PLAN.md`](./research/ACTION-PLAN.md) + the reports under [`research/`](./research/README.md) (incl. [`research/agentic-loops/REPORT.md`](./research/agentic-loops/REPORT.md) — the most cross-cutting), plus [`research/prior-art.md`](./research/prior-art.md). Durability filter for every item: *build the oversight harness; rent the wording.*

**Platform landscape (2026-06-07, notes — not decisions):** Claude Code now ships much of the autonomy/loop machinery (`/goal`, `/loop`, dynamic Workflows, `/effort ultracode`, agent-view, hooks). These are **inputs to weigh** — captured in [`research/platform-landscape.md`](./research/platform-landscape.md). **E2 turns this into an explicit scoping decision** (what to offload to the platform vs keep hand-rolled), which gates several orchestration items.

**Durability filter is an ONGOING check, not a one-time sort.** Scaffolds can flip net-positive→net-negative *silently* across one model generation (agentic-loops: the "Prompting Inversion" — a GPT-4o win becomes a GPT-5 tax). So "build the harness; rent the wording" is re-run/instrumented per model upgrade, not decided once (see E13's absorption-instrumentation note).

**Renumbering map (2026-06-07).** Old→New: E2→E3, E3→E6, E4→E5, E5→E4, E6→E16, E7→E9, E8→E7, E9→E10, E10→E11, E11→E12, E12→E14, E13→E15, E14→E17, E15→E13. Unchanged: E1. **New:** E2 (platform scoping decision), E8 (externalize the sizing signal), E18 (design-emits-workflow).

---

## Tier 1 — Foundations (do now: specced, cheap, or gating)

| ID | Item | Sources | Deps |
|---|---|---|---|
| **E1** ✅ | Apply the 6 surgical edits to `sk-agent-prompts.md` (positive guardrails; ">10" as a smell; few-shot model-dependent; "reasoning ≠ constraint-guarantee"; model-dependence; directive-priority) **+ reinforce R5 (no-self-validation) with hard evidence: self-verification is net-NEGATIVE and the gate must be a *different* invocation than the worker** | `references/sk-agent-prompts-revisions.md` (shipped), `research/prompting/REPORT.md`, `research/agentic-loops/REPORT.md` (R5/Angle-1) | — |
| **E2** ✅ | **Platform-primitives scoping decision** — resolved by **ADR-0002 "own the loop, rent the fan-out"** (2026-06-10, pending operator sign-off): write-path loop stays hand-rolled (and shrinks); read-only breadth fan-out rents Workflow behind a seam + capability probe + budget tiers; hooks become the tier-0 deterministic enforcement base; `/goal`/`/loop` ignored as substrates. Spawned E19–E22; reframed E17/E18. Research: `research/platform-coupling/` + `research/enforcement-surface/`. | `adr/0002-platform-primitives-scoping.md`, `backlog/platform-primitives-scoping.md` | — |
| **E3** | **Audit the shipped toolchain** against the revised discipline (by role — see below) | per-group below + `research/agentic-loops/REPORT.md` | E1 |
| **E4** | Codify **"orchestrator owns deliverable writes; subagents return data"** (proven 6×) — *the Workflow runtime already provides this (plan-in-script-vars); scope = what we add on top* | `research/SYNTHESIS.md`, `research/orchestration/REPORT.md`, `research/platform-landscape.md` | E2 |
| **E5** | Codify **"no parallel writers / default single-agent, justify fan-out"** — now strongly evidenced (single-agent ≥ MAS at matched budget + Data-Processing-Inequality argument) | `research/orchestration/REPORT.md` (F10), `research/agentic-loops/REPORT.md` (Tran & Kiela; Cognition coherence) | E2 |
| **E6** | Research-first **framing pass + bidirectional over-engineering guard + cap-iteration & best-so-far checkpoint** (non-monotonic: looping-until-gate can degrade a previously-correct result; prefer parallel-sample-and-select over longer chains) | `research/reasoning-capability/REPORT.md` (F4/F5), `research/agentic-loops/REPORT.md` (non-monotonic; parallel>sequential) | tier-calibration ← **E8** (the difficulty signal must be externalized — ship the framing-first discipline now, wire the calibration when E8 lands) |

**E3 audit — by role (each role-group = one planning session):**

| Group | Files | Governing research |
|---|---|---|
| **Reviewers/verifiers (9)** | `sk-{architecture,correctness,maintainability,security,spec,test}-reviewer`, `sk-goal-verifier`, `sk-structural-checker`, `sk-crossref-checker` | `verification-autonomy` (independence, no-self-validation, cross-family, CoVe) + `prompting` (positive guardrails) + `agentic-loops` (**self-verification net-negative; seal the gate from the producer — reward-hacking scales with capability+visibility**) |
| **Researchers (6)** | `sk-researcher-{context,decision,impl}`, `sk-research-synthesiser`, `sk-explorer`, `sk-pattern-mapper` | `reasoning-capability` (framing-first, bidirectional dial, capability-gap) + `agentic-loops` (sizing self-assessment is broken → don't trust the worker's difficulty estimate) |
| **Drafters/planners (5)** | `sk-plan-drafter`, `sk-plan-reconciler`, `sk-decision-drafter`, `sk-rfc-drafter`, `sk-architectural-advisor` | `prompting` + `reasoning-capability` — reason-then-structure, positive framing |
| **Executors (2)** | `sk-executor`, `sk-fixer` | `orchestration` + `agentic-loops` — single-threaded writes, orchestrator-owns-writes, cap-iteration |
| **Skills/orchestrators (6)** | `sk-{build,decide,design,goal-verify,regen-plan,review}` | `orchestration` + `reasoning-capability` + `prompting` + `agentic-loops` — research-first default, over-engineering guard, **CoT-for-orchestrators caveat** (reasoning ≠ constraint-guarantee), cap-iteration/best-so-far, structure-at-boundaries |
| **Rules (4)** | `sk-{clean-code,typescript,workflow,working-standards}` | `prompting` — positive framing, directive-density-as-smell |
| **Utility (1)** | `sk-branch-precheck` | (light) — **pilot F2: should *create* the branch (orchestrator-side offer), not just recommend** |

**Pilot (E19) inputs to this audit** (see `backlog/platform-primitives-scoping.md` Findings F1–F10): Researchers ← F3 (collapse `complexity` to a surfaced `should_research`), F4 (surface research briefs; thin-repo grounding), F7 (researcher non-reproducibility); Orchestrators ← F5 (lay options/questions out in chat) + the sk-design interaction rework, **gated by E23/ADR-0003 — do that first**; Utility ← F2.

---

## Tier 2 — Scoped builds & decisions

| ID | Item | Sources | Deps |
|---|---|---|---|
| **E7** | Independent guardrail/output verification (CoVe-style + **seal the gate from the producer's context** + audit constraint-adherence at high stakes) — reuses existing verifier agents/quorum. **Down-payment toward the E13 keystone.** | `research/verification-autonomy/REPORT.md`, `research/prompting/REPORT.md`, `research/agentic-loops/REPORT.md` (self-verify net-negative; reward-hacking; gap-widens) | ready (verifier agents exist) |
| **E8** | **Externalize the sizing/routing signal** — the binding weak spot: self-reported confidence is broken (agents predict ~73% success vs ~35% true), yet the "when-to-loop / how-big-a-leaf / how-much-process" decision rides on it. Pick empirically among conformal-over-N / a separate monitor agent / variance-proxy / escalate-to-human. **Feeds E6 and E11.** | `research/agentic-loops/REPORT.md` (#1 finding), `research/context-memory/REPORT.md` (self-report refuted) | — |
| **E9** | Forcing-function for context/escalation (a hook that *triggers* compact/handoff/escalate at thresholds; default-escalate on `irreversible ∧ low-confidence`) **+ structured/verbatim handoff over lossy LLM re-summarization; keep errors visible *within* a leaf, drop them *at* the handoff boundary** | `research/context-memory/REPORT.md`, `research/reasoning-capability/REPORT.md`, `research/agentic-loops/REPORT.md` (AMA-Bench; self-conditioning) | fairly independent |
| **E10** | **Navigability layer over markdown memory** (token-level + index/query/compare) — #1 daily-pain fix; **recommended first real build**. Reinforced: engineered memory underperforms naive long-context (~40%) → keep token-level + add a navigation layer, *don't* switch to embeddings | `research/memory/REPORT.md`, `research/agentic-loops/REPORT.md` (AMA-Bench) | — |
| **E11** | Operator-dial tooling (operator sets effort/autonomy/risk/budget bounds **+ context isolation↔handoff balance**; model adapts within) — validated by bounded adaptive thinking | `backlog/operator-dial-tooling.md`, `research/reasoning-capability/REPORT.md` (F6), `DESIGN-PRINCIPLES.md` (#5), `research/agentic-loops/REPORT.md` | **E8** (sizing) |
| **E12** | Cross-family quorum for high-stakes verification — now the direct upgrade to **`/goal`'s same-family Haiku evaluator**; strongest durability argument in the program = the **gen-verification gap WIDENS with scale**; weak verifiers **aggregate** to strong (Weaver). Needs a non-Anthropic-verifier dependency decision | `backlog/cross-family-quorum.md`, `research/verification-autonomy/REPORT.md`, `research/agentic-loops/REPORT.md` (Mind-the-Gap; Weaver), `research/platform-landscape.md` | relates E7/E13 |

---

## Tier 3 — Keystone design / memory chain / defer

| ID | Item | Sources | Deps |
|---|---|---|---|
| **E13** | **Verification/eval layer — THE KEYSTONE** (weigh pulling forward as soon as E2 lands). Study `gsd-eval-{planner,auditor}` + `nyquist-auditor` + AI-SPEC, then design sidekick's: rubric tiering (Code/LLM-judge/Human), producer≠verifier audit, verifier-manufacturing, **`/goal`-completion-condition = an eval rubric in disguise**, add cross-family, generalise beyond AI-apps. Gate-design findings: **NP-checkable leaves are the *precondition* for a cheap sound gate; PRMs can *reduce* accuracy on complex tasks; LLM-judge biases**. Also: **instrument gates for absorption/inversion** (durability filter as an ongoing check). | `research/prior-art.md`, `research/verification-autonomy/REPORT.md`, `research/agentic-loops/REPORT.md` (Angle-2/9) | E2; relates E7/E12 |
| **E14** | Episodic / session memory (the missing memory type) | `research/memory/REPORT.md`, `research/agentic-loops/REPORT.md` (handoff/self-conditioning) | E2, E10 |
| **E15** | Memory substrate decision (markdown vs SQLite+FTS5/sqlite-vec vs graph) — do NOT pre-pick | `research/memory/REPORT.md` | E14 |
| **E16** | Validate-before-persist memory gate (independent check before any memory write; selective formation; reconcile-not-append; user-editable, **not** silently agent-editable) | `research/memory/REPORT.md`, `research/verification-autonomy/REPORT.md`, `research/agentic-loops/REPORT.md` (gate independence) | E10/E14/E15 |
| **E17** | MAS dispatch thresholds (calibrate the fan-out value/parallelism bar) — now with numbers: Anthropic's +90.2% is **breadth-only**, ~**80% of the variance is token spend**; MAS pays for breadth/independent/high-volume-low-relevance, single-thread for coherence-bound. *Reframed by ADR-0002:* calibrate dispatch **into the rented fan-out backend** (E19's seam) and tune the **budget-tier defaults** from E21's usage data. **Pilot (E19) datapoint:** the tier gates research *width*, but total cost is dominated by *iteration depth* — `quick` (1 researcher) cost MORE than `standard` (~625k vs ~515k; F6); a clean workflow-vs-agents comparison is still owed (F8). The cost knob may be in the wrong place. | `research/orchestration/REPORT.md` (F11), `research/agentic-loops/REPORT.md`, `adr/0002-platform-primitives-scoping.md` | E2 ✅, E19, E21 |
| **E18** | **Design-emits-workflow (candidate)** — design's deliverable could be an executable workflow whose gates ARE the RFC goals; proceduralize the **META** (gates/structure/verification), never the **OBJECT** (work stays a high-level `agent()` call). Evidence caveat: compiled/static workflows **overfit** their distribution (AFlow) → keep the OBJECT dynamic, GEPA-optimize the meta-skeleton. *Narrowed by ADR-0002:* workflow-emission applies to **read-only fan-out only**; the prose plan stays the write-path artifact (no-mid-run-input + same-session-resume + acceptEdits, all verified). Revisit triggers in the ADR table. | `adr/0002-platform-primitives-scoping.md`, `research/platform-landscape.md`, `research/agentic-loops/REPORT.md` (Angle-5/plan-as-program), `adr/0001-harness-shape.md` | E13 (gates), E11 (dial), E2 ✅ |

**New items from ADR-0002 (appended 2026-06-10 — IDs append-only, priority in the row, no renumber):**

| ID | Item | Sources | Deps |
|---|---|---|---|
| **E19** ✅ | **Fan-out seam + pilot** (Tier-1 priority; done 2026-06-15 — pilot findings F1–F10 in `backlog/platform-primitives-scoping.md`) — `sidekick capabilities` probe (CC version, `disableWorkflows`); `fanout: { backend: auto\|workflow\|agents, budget: quick\|standard\|deep }` in config (default `standard`; `deep` opt-in; tiers gate verification depth, not just agent count); seam in skills (dispatch references "the configured backend", never Workflow semantics); pilot ONE read-only workload (research fan-out), instrumented — doubles as the fidelity/absorption experiment; **consumer onboarding + documented-limits docs** current for repo-cloning testers. | `adr/0002-platform-primitives-scoping.md`, `research/platform-coupling/REPORT.md` | E2 ✅ |
| **E20** | **Tier-0 enforcement base** (Tier-1 priority, small) — `sidekick init` optionally installs the hooks base: PreToolUse deny for the safety tier (protect gate definitions + frozen RFC sections) + Stop-hook working-tree scan (closes the Bash-bypass gap; only always-on write gate inside workflows). Only never-wrong rules. Substrate for E9's forcing-function and E21. | `adr/0002-platform-primitives-scoping.md`, `research/enforcement-surface/REPORT.md` (F1/F2) | E2 ✅ |
| **E21** | **Usage instrumentation** (Tier-1 priority, small) — local-only gitignored JSONL via the hooks base: task/wave counts (tests ADR-0001's task-size assumption), fan-out runs (backend/tier/tokens/outcome → calibrates budget tiers, feeds E8 + E17). | `adr/0002-platform-primitives-scoping.md` | E20 |
| **E22** | **Generated enforcement + tier mobility** (Tier-3) — the enforcement-generation loop: analyze project/objective → propose per-project hooks/dimensional agents/gates; **independent calibration before a generated gate binds** (producer≠verifier recurses); intent-anchored regeneration on drift triggers; anti-mock + integration-check dimensions; **tier mobility** (leaking tier-1 rules promote to tier-0/2 backstops; absorption data demotes stale gates); consumer-extensible tier-1 rules. Threshold-gated by the dial (E11). | `adr/0002-platform-primitives-scoping.md`, `research/enforcement-surface/REPORT.md` (F7–F9), `research/prior-art.md` (nyquist/eval-planner) | E13, E20, relates E7/E11 |
| **E23** | **Design interaction model decision (ADR-0003)** (Tier-1 — gates the sk-design / orchestrator slice of E3) — resolve whether `/sk-design` is dialogue-by-default (research surfaced for discussion before the RFC sets) with `--auto` for one-shot, vs today's produce-then-confirm. Folds in pilot findings F4/F5/F9 (surface briefs · lay out options/questions · complexity-as-signal · mid-conversation budget). Down-payment on E11; feeds E8; reshapes E18's design-deliverable question. | `adr/0003-design-interaction-model.md`, `backlog/platform-primitives-scoping.md` (Pilot findings F3/F4/F5/F9) | E19 ✅ (pilot data) |

**Research-before-build (not buildable until researched):**
- **CoT faithfulness** — gates any auditable decision-trace feature.
- **Capability-registry / self-knowledge** — gates capability-aware escalation.
- **Track E** — does single-agent-under-matched-budget hold on tool-heavy/long-horizon work?
- **The fuzzy-goal gate gap** — is there *any* sound gate short of a human for "make this codebase better," or does decompose-to-crisp-leaves always bottom out in "ask the human"? (agentic-loops open track)

(See the live problem-space map in [`research/README.md`](./research/README.md).)

**Prior art (gsd) — study before building** (`research/prior-art.md`): memory (E10/E14/E15) → `gsd-graphify` + `gsd-thread` + pause/resume handoff; eval (E13) → `gsd-eval-{planner,auditor}` + `nyquist-auditor` + AI-SPEC. gsd has built credible versions of our two stated blind spots — borrow, don't reinvent. Shared gap to add on top: **cross-family** verification (none of the three toolchains has it).

---

## Sequencing recommendation
1. **E1** ✅ **+ E2** ✅ (ADR-0002, 2026-06-10).
2. **E19** ✅ **/E20/E21** (ADR-0002 follow-through: fan-out seam+pilot **done**, tier-0 hooks base, instrumentation — the pilot generated the data everything downstream calibrates on; findings F1–F10 in `backlog/platform-primitives-scoping.md`) **+ E23** (ADR-0003 — the design-interaction decision; **must land before E3's sk-design/orchestrator audit**) **+ E3** (audit by role-group; the sk-design slice waits on E23; includes the sk-build shrink) **+ E4/E5/E6** (rule codifications — now unblocked; E6 ships framing-first now, calibration after E8).
3. **E7** (verification down-payment) **+ E8** (sizing signal — unblocks E6/E11) **+ E9/E10** (forcing-function — mounts on E20's hooks base — and navigability).
4. **E13** (eval keystone — pull forward now that E2 landed) **+ E11/E12** (operator-dial, cross-family).
5. Defer the memory chain (**E14/E15/E16**), **E17** (needs E19/E21 data), **E18** (narrowed; triggers in ADR-0002), and **E22** (needs E13/E20).
