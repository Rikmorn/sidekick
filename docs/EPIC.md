# EPIC — Apply the research learnings to the harness

**Status:** Planning — nothing executed. **Each item below is its own future planning session.** Tiers = priority; **IDs now ascend with intended execution order** (renumbered 2026-06-07). **Sources** link the research that justifies each item; **Deps** note prerequisites.

**Scope:** this epic changes the **shipped product** (`agents/`, `skills/`, `rules/`) and the **authoring discipline** (`.claude/rules/sk-agent-prompts.md`). The project-vs-product boundary is already documented in `AGENTS.md` ("Project vs usage") and `.claude/README.md`. Product changes are consumer-facing — treat with the same care as any shipped change (cover via `smokes/` fixtures).

**Rationale & full detail:** [`research/ACTION-PLAN.md`](./research/ACTION-PLAN.md) + the reports under [`research/`](./research/README.md) (incl. [`research/agentic-loops/REPORT.md`](./research/agentic-loops/REPORT.md) — the most cross-cutting), plus [`research/prior-art.md`](./research/prior-art.md). Durability filter for every item: *build the oversight harness; rent the wording.*

**Platform landscape (2026-06-07, notes — not decisions):** Claude Code now ships much of the autonomy/loop machinery (`/goal`, `/loop`, dynamic Workflows, `/effort ultracode`, agent-view, hooks). These are **inputs to weigh** — captured in [`research/platform-landscape.md`](./research/platform-landscape.md). **E2 turns this into an explicit scoping decision** (what to offload to the platform vs keep hand-rolled), which gates several orchestration items.

**Durability filter is an ONGOING check, not a one-time sort.** Scaffolds can flip net-positive→net-negative *silently* across one model generation (agentic-loops: the "Prompting Inversion" — a GPT-4o win becomes a GPT-5 tax). So "build the harness; rent the wording" is re-run/instrumented per model upgrade, not decided once (see E13's absorption-instrumentation note).

**Renumbering map (2026-06-07).** Old→New: E2→E3, E3→E6, E4→E5, E5→E4, E6→E16, E7→E9, E8→E7, E9→E10, E10→E11, E11→E12, E12→E14, E13→E15, E14→E17, E15→E13. Unchanged: E1. **New:** E2 (platform scoping decision), E8 (externalize the sizing signal), E18 (design-emits-workflow).

---

## Tier 1 — Foundations (do now: specced, cheap, or gating)

| ID | Item | Sources | Deps |
|---|---|---|---|
| **E1** | Apply the 6 surgical edits to `sk-agent-prompts.md` (positive guardrails; ">10" as a smell; few-shot model-dependent; "reasoning ≠ constraint-guarantee"; model-dependence; directive-priority) **+ reinforce R5 (no-self-validation) with hard evidence: self-verification is net-NEGATIVE and the gate must be a *different* invocation than the worker** | `backlog/sk-agent-prompts-revisions.md`, `research/prompting/REPORT.md`, `research/agentic-loops/REPORT.md` (R5/Angle-1) | — |
| **E2** | **Platform-primitives scoping decision** — given CC now ships `/goal` / `/loop` / dynamic Workflows / hooks / agent-view: decide what to **offload** (sk-build's wave/gate/resume orchestration → the Workflow runtime?) vs **keep** hand-rolled, and what sidekick adds on top. **Gates E4/E5/E13/E17/E18.** | `research/platform-landscape.md`, `research/agentic-loops/REPORT.md`, `research/orchestration/REPORT.md` | — |
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
| **Utility (1)** | `sk-branch-precheck` | (light — likely no change) |

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
| **E17** | MAS dispatch thresholds (calibrate the fan-out value/parallelism bar) — now with numbers: Anthropic's +90.2% is **breadth-only**, ~**80% of the variance is token spend**; MAS pays for breadth/independent/high-volume-low-relevance, single-thread for coherence-bound | `research/orchestration/REPORT.md` (F11), `research/agentic-loops/REPORT.md` | E2 |
| **E18** | **Design-emits-workflow (candidate)** — design's deliverable could be an executable workflow whose gates ARE the RFC goals; proceduralize the **META** (gates/structure/verification), never the **OBJECT** (work stays a high-level `agent()` call). Evidence caveat: compiled/static workflows **overfit** their distribution (AFlow) → keep the OBJECT dynamic, GEPA-optimize the meta-skeleton. Costs: background workflows can't interactively route deviations (halt-and-escalate); large-task-only | `research/platform-landscape.md`, `research/agentic-loops/REPORT.md` (Angle-5/plan-as-program), `adr/0001-harness-shape.md` | E13 (gates), E11 (dial), E2 (platform) |

**Research-before-build (not buildable until researched):**
- **CoT faithfulness** — gates any auditable decision-trace feature.
- **Capability-registry / self-knowledge** — gates capability-aware escalation.
- **Track E** — does single-agent-under-matched-budget hold on tool-heavy/long-horizon work?
- **The fuzzy-goal gate gap** — is there *any* sound gate short of a human for "make this codebase better," or does decompose-to-crisp-leaves always bottom out in "ask the human"? (agentic-loops open track)

(See the live problem-space map in [`research/README.md`](./research/README.md).)

**Prior art (gsd) — study before building** (`research/prior-art.md`): memory (E10/E14/E15) → `gsd-graphify` + `gsd-thread` + pause/resume handoff; eval (E13) → `gsd-eval-{planner,auditor}` + `nyquist-auditor` + AI-SPEC. gsd has built credible versions of our two stated blind spots — borrow, don't reinvent. Shared gap to add on top: **cross-family** verification (none of the three toolchains has it).

---

## Sequencing recommendation
1. **E1** (specced edits, lowest risk) **+ E2** (platform scoping decision — gates the orchestration items; do early).
2. **E3** (audit by role-group) **+ E4/E5/E6** (rule codifications — E4/E5 follow E2; E6 ships the framing-first discipline now, calibration after E8).
3. **E7** (verification down-payment) **+ E8** (sizing signal — unblocks E6/E11) **+ E9/E10** (forcing-function, navigability — the first real builds).
4. **E13** (eval keystone — the durable core; pull forward once E2 lands) **+ E11/E12** (operator-dial, cross-family).
5. Defer the memory chain (**E14/E15/E16**), **E17**, and the **E18** candidate until upstream (E2/E10/E13) is set.
