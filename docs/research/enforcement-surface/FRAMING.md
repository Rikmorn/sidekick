# Enforcement Surface — Research Framing

**Status:** Pre-research framing (2026-06-10). Captures the E2 discussion state + open questions + disconfirming angles, *before* the deep-research sweep. Relationship: extends [`../verification-autonomy/REPORT.md`](../verification-autonomy/REPORT.md) (gate independence) and [`../agentic-loops/REPORT.md`](../agentic-loops/REPORT.md) Angle 2 (gates) from *verification events* to the *standing enforcement surface* around agent work; feeds E2 (substrate), E7 (independent verification), E13 (eval keystone).

## Why this research

Two triggers. (1) The 2026-06-10 platform verification confirmed hooks fire deterministically inside workflow-spawned agents — meaning the enforcement surface can live *below* both orchestration substrates, which no existing research track examined. (2) Operator reframe (2026-06-10 discussion): enforcement is not a single gate but a **layered surface** — a deterministic base minimum + prompted discipline + extensible, **per-project generated** mechanisms (project-specific hooks, custom dimensional agents, e.g. security-minded) — and *generating that surface is itself a loop application*: look at project/work/objective → derive enforcement mechanisms → verify them → reconcile as the project drifts.

## What we currently believe (to confirm / challenge / enrich)

1. **Layered tiering** maps to existing findings: deterministic code gates (cheap, sound, narrow — hooks/CI/typecheck) → prompted discipline (broad, soft) → dimensional LLM verifiers (semantic, costly) → human (irreversible ∧ low-confidence). Same shape as gsd's Code/LLM-judge/Human rubric tiering.
2. **Generated per-project enforcement has working precedents**: gsd-nyquist-auditor (manufactures failing-capable tests per requirement), gsd-eval-planner (designs evals per system), the claude-automation-recommender pattern (codebase analysis → recommended hooks/agents/skills). E13 already names "verifier-manufacturing"; the reframe generalizes it from eval artifacts to the whole standing surface.
3. **Producer ≠ verifier applies one level up**: an agent generating the gates that will later gate it re-creates self-verification at the meta level; generated gates need independent review, and reward-hacking scales with the worker's visibility into the gate (METR).
4. **Generated static artifacts go stale** (the AFlow overfit lesson transposed): enforcement generated once overfits the project state at generation time; a reconcile/regenerate trigger (check-drift-style) is required.
5. **Sealing is the weak point**: with filesystem access the worker can read or edit hook scripts/tests; true sealing likely requires out-of-repo or org-managed or CI-side placement. (Open question 5 in agentic-loops.)
6. Hooks gate **syntax** (tool calls, files, commands), not **semantics** — the deterministic tier cannot carry design-soundness judgments; don't over-promise it.
7. **Documented limits are a deliverable** (operator, 2026-06-10): where a limit can't be engineered away (sealing, judge fallibility), the harness ships the limit *documented* plus operator guidance for minimising it — consumers decide informed. Operator guidance is a first-class output class alongside gates ("human-level guidance").

## Core question

How should a coding-agent harness design its enforcement surface — which checks belong at which layer; how per-project gates get *generated, independently reviewed, sealed, and kept fresh*; and how human escalation stays actionable in halt-and-resume loops?

## Angles (the sweep)

- **A1** Deterministic runtime guardrail layers in practice — CC hooks best practices, policy-as-code (OPA/Rego), NeMo Guardrails / Guardrails AI, sandboxing, CI-as-gate; evidence on layer assignment.
- **A2** Generated per-project enforcement — generated behavioral tests, generated semgrep/lint rules, generated hooks/policies; durability, staleness, reconciliation loops.
- **A3** Gate integrity/sealing — reward hacking against editable gates; mitigations (out-of-repo, managed settings, CI-side, privilege separation, read-only gate definitions).
- **A4** Meta producer≠verifier — who authors the gates; independent review/calibration of generated verifiers.
- **A5** Escalation ergonomics — interrupt/checkpoint patterns (LangGraph interrupts, HITL middleware), batched vs immediate escalation, actionability vs rubber-stamping (automation bias).

## Disconfirming angles to plant

- Maybe generated enforcement is mostly **ceremony** below a project-size threshold — the over-engineering dial (E6/reasoning F4/F5) applied to enforcement itself.
- Maybe **sealing is effectively impossible** with filesystem access, making the deterministic tier weaker than believed — in which case CI-side/out-of-process placement isn't a mitigation but the *only* sound design.
- Maybe gate *generation* quality is the bottleneck (gameable presence-based rubrics — the at-risk bucket), and hand-curated minimal gates beat generated broad ones.

## Conventions

Output → `REPORT.md` + `sources.md` here, written by the **orchestrator (main session)** from the workflow's return. Spot-check post-cutoff (> Jan 2026) citations before treating any as load-bearing; label verified-by-me vs from-the-run.
