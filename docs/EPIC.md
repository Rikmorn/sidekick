# EPIC — Apply the research learnings to the harness

**Status:** Planning — nothing executed. **Each item below is its own future planning session.** Tiers = priority/sequencing; "Sources" link the research that justifies the item.

**Scope:** this epic changes the **shipped product** (`agents/`, `skills/`, `rules/`) and the **authoring discipline** (`.claude/rules/sk-agent-prompts.md`). The project-vs-product boundary is already documented in `AGENTS.md` ("Project vs usage") and `.claude/README.md`. Product changes are consumer-facing — treat with the same care as any shipped change (cover via `smokes/` fixtures).

**Rationale & full detail:** [`research/ACTION-PLAN.md`](./research/ACTION-PLAN.md) + the six reports under [`research/`](./research/README.md), plus [`research/prior-art.md`](./research/prior-art.md) (superpowers & gsd vs our findings). Durability filter for every item: *build the oversight harness; rent the wording.*

---

## Tier 1 — do now (cheap, durable, no new dependency)

### 1a. Discipline + audit (docs/rules edits)

| ID | Item | Sources | Status |
|---|---|---|---|
| **E1** | Apply the 6 surgical edits to `sk-agent-prompts.md` (positive guardrails; ">10" as a smell; few-shot model-dependent; add "reasoning ≠ constraint-guarantee"; model-dependence note; directive-priority tiers) | `backlog/sk-agent-prompts-revisions.md`, `research/prompting/REPORT.md` | ☐ |
| **E2** | **Audit the shipped toolchain against the revised discipline** (by role — see below) | per-group below | ☐ |
| **E3** | Codify the research-first **framing pass + bidirectional over-engineering guard** (cheap always-on framing sets a difficulty tier; justify *adding* depth as well as skipping; prefer parallel-sample-and-select over longer chains) | `research/reasoning-capability/REPORT.md` (F4/F5) | ☐ |
| **E4** | Make **"no parallel writers / default single-agent, justify fan-out"** an explicit rule | `research/orchestration/REPORT.md` (F10) | ☐ |
| **E5** | Codify **"orchestrator owns deliverable writes; subagents return data"** (proven 6× this session) | `research/SYNTHESIS.md` | ☐ |

**E2 audit — by role (each role-group = one planning session):**

| Group | Files | Governing research |
|---|---|---|
| **Reviewers/verifiers (9)** | `sk-{architecture,correctness,maintainability,security,spec,test}-reviewer`, `sk-goal-verifier`, `sk-structural-checker`, `sk-crossref-checker` | `research/verification-autonomy/REPORT.md` — independence, no-self-validation, **cross-family** option, CoVe; + positive guardrails (`prompting`) |
| **Researchers (6)** | `sk-researcher-{context,decision,impl}`, `sk-research-synthesiser`, `sk-explorer`, `sk-pattern-mapper` | `research/reasoning-capability/REPORT.md` — framing-first, bidirectional dial, capability-gap |
| **Drafters/planners (5)** | `sk-plan-drafter`, `sk-plan-reconciler`, `sk-decision-drafter`, `sk-rfc-drafter`, `sk-architectural-advisor` | `research/prompting/REPORT.md` + `reasoning-capability` — reason-then-structure, positive framing |
| **Executors (2)** | `sk-executor`, `sk-fixer` | `research/orchestration/REPORT.md` — single-threaded writes, orchestrator-owns-writes |
| **Skills/orchestrators (6)** | `sk-{build,decide,design,goal-verify,regen-plan,review}` | `orchestration` + `reasoning-capability` + `prompting` — research-first default, over-engineering guard, **CoT-for-orchestrators caveat** (reasoning ≠ constraint-guarantee), structure-at-boundaries |
| **Rules (4)** | `sk-{clean-code,typescript,workflow,working-standards}` | `research/prompting/REPORT.md` — positive framing, directive-density-as-smell |
| **Utility (1)** | `sk-branch-precheck` | (light — likely no change) |

### 1b. Small builds (a hook/skill each)

| ID | Item | Sources | Status | Dependency |
|---|---|---|---|---|
| **E6** | Validate-before-persist memory gate (independent check before any memory write; selective formation; reconcile-not-append; user-editable, **not** silently agent-editable) | `research/memory/REPORT.md`, `verification-autonomy` | ☐ | **depends on a memory layer** (E9/E12/E13) — sequence after |
| **E7** | Forcing-function for context/escalation (a hook that *triggers* compact/handoff/escalate at thresholds; default-escalate on `irreversible ∧ low-confidence`) | `research/context-memory/REPORT.md`, `reasoning-capability` | ☐ | fairly independent |
| **E8** | Independent guardrail/output verification (CoVe-style + audit constraint-adherence at high stakes) — reuses the existing verifier agents/quorum | `research/verification-autonomy/REPORT.md`, `prompting` | ☐ | ready (verifier agents exist) |

---

## Tier 2 — decisions / scoped builds

| ID | Item | Sources | Status |
|---|---|---|---|
| **E9** | **Navigability layer over markdown memory** (token-level + index/query/compare) — #1 daily-pain fix; **recommended first real build** | `research/memory/REPORT.md` | ☐ |
| **E10** | Operator-dial tooling (operator sets effort/autonomy/risk/budget bounds **+ the context isolation↔handoff balance**; model adapts within) — validated by bounded adaptive thinking | `backlog/operator-dial-tooling.md`, `research/reasoning-capability/REPORT.md` (F6), `DESIGN-PRINCIPLES.md` (#5) | ☐ |
| **E11** | Cross-family quorum for high-stakes verification — **needs a non-Anthropic-verifier dependency decision** | `backlog/cross-family-quorum.md`, `research/verification-autonomy/REPORT.md` | ☐ |

---

## Tier 3 — defer / research-first

| ID | Item | Sources | Status |
|---|---|---|---|
| **E12** | Episodic / session memory (the missing memory type) | `research/memory/REPORT.md` | ☐ |
| **E13** | Memory substrate decision (markdown vs SQLite+FTS5/sqlite-vec vs graph) — do NOT pre-pick | `research/memory/REPORT.md` | ☐ |
| **E14** | MAS dispatch thresholds (calibrate the fan-out value/parallelism bar) | `research/orchestration/REPORT.md` (F11) | ☐ |
| **E15** | **Verification/eval layer** — study `gsd-eval-{planner,auditor}` + `nyquist-auditor` + AI-SPEC as prior art (Track A *built*), then design sidekick's: rubric tiering (Code/LLM-judge/Human), producer≠verifier audit, verifier-manufacturing; **add cross-family** + generalise beyond AI-apps. The keystone (verification) we haven't built. | `research/prior-art.md`, `research/verification-autonomy/REPORT.md` | ☐ |

**Research-before-build (not buildable until researched):**
- **CoT faithfulness** — gates any auditable decision-trace feature.
- **Capability-registry / self-knowledge** — gates capability-aware escalation.
- **Track E** — does single-agent-under-matched-budget hold on tool-heavy/long-horizon work?

(See the live problem-space map in [`research/README.md`](./research/README.md).)

**Prior art (gsd) — study before building** (`research/prior-art.md`): memory (E9/E12/E13) → `gsd-graphify` (confidence-tiered knowledge graph) + `gsd-thread` (persistent context) + pause/resume handoff; eval (E15) → `gsd-eval-{planner,auditor}` + `nyquist-auditor` + AI-SPEC. gsd has built credible versions of our two stated blind spots — borrow, don't reinvent. Shared gap to add on top: **cross-family** verification (none of the three toolchains has it).

---

## Sequencing recommendation
1. **E1** (apply the doc edits — fully specced, lowest risk).
2. **E2** (audit by role-group, each a planning session) + **E3/E4/E5** (rule codifications).
3. **E9** (navigability layer) as the first real *build*; **E7/E8** alongside.
4. Park **E10/E11** (decisions); defer Tier 3 until upstream memory direction is set.
