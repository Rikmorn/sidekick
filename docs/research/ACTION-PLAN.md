# Action Plan — revisited tiers across ALL research (v2)

*Supersedes the action-map in `SYNTHESIS.md` (which covered only Tracks A/B/C). Integrates A (verification), B (context-memory), C (orchestration), Memory, Reasoning-Capability, and Prompting. 2026-06-07. Still a plan, not yet executed.*

## What changed since the first (A/B/C-only) tiers
- **Memory:** episodic memory is the gap (current `MEMORY.md` is semantic/procedural); observability = a **navigability layer over a token-level** form, not a different store; writes need selective-formation + reconcile-not-append + **user-editable-but-not-silently-agent-editable**.
- **Reasoning-Capability:** the dial is **bidirectional** — overthinking is *net-negative*, not just wasteful. So "research-first" becomes "a cheap always-on framing pass that sets a difficulty tier within operator bounds, with a symmetric over-engineering guard," NOT "default heavy." The operator-dial is validated (bounded adaptive thinking).
- **Prompting:** concrete `sk-agent-prompts.md` edits; "**reasoning is not a constraint-guarantee**" → audit guardrails externally at high stakes; positive guardrails over prohibitions; directive priority/tiers.

---

## Tier 1 — do now (cheap, durable, no new dependency)

### 1a. Pure docs/rules edits (hours, no code — highest leverage per effort)
1. ✅ **Apply the `sk-agent-prompts.md` revisions** → `../references/sk-agent-prompts-revisions.md` (shipped in E1): positive guardrails (top), ">10" as a *smell*, few-shot model-dependent, add "reasoning ≠ constraint-guarantee", model-dependence note, directive-priority tiers. *(Prompting)*
2. **Make "no parallel writers / default single-agent, justify fan-out" an explicit rule.** *(C)*
3. **Codify the research-first framing pass as a rule** — always-on *cheap* framing pass that sets a difficulty tier; **symmetric guard**: justify *adding* depth as well as skipping it; prefer parallel-sample-and-select over ever-longer sequential chains. *(Reasoning F4/F5; revised from the original "default-heavy")*
4. **Codify "orchestrator owns deliverable writes; subagents return data."** Proven necessary 6× this session (flaky subagent file-writes). *(Meta + C)*

### 1b. Small builds (a hook/skill each)
5. **Validate-before-persist memory gate** — independent check before any memory write; selective formation (keep what has future utility); reconcile-not-append; user-editable but not silently agent-editable. *(A + B + Memory)*
6. **Forcing-function for context/escalation** — a hook that *triggers* compact/handoff/escalate at thresholds (don't just surface the number); default-escalate on `irreversible ∧ low-confidence`. *(B + Reasoning + A)*
7. **Independent guardrail/output verification** — CoVe-style (verifier doesn't see the draft) + audit *constraint-adherence* at high stakes (reasoning can drop guardrails). Reuse the existing quorum / no-self-validation pattern. *(A + Prompting F3)*

---

## Tier 2 — decisions / scoped builds

- **Navigability layer over markdown memory** — token-level + index/query/compare over what's known. The **#1 daily-pain fix** (observability), tractable, and it does **not** require the unsolved memory frontier. **Recommended first *real* build.** *(Memory)*
- **Operator-dial tooling** — NOW VALIDATED (controllable-vs-adaptive; Anthropic bounded adaptive thinking). Operator sets bounds (effort/autonomy/risk/budget), model adapts within. Needs scoping: which knobs, how surfaced, deterministic-enforce vs guidance. → `../backlog/operator-dial-tooling.md`. *(Reasoning F6)*
- **Cross-family quorum** — needs a non-Anthropic verifier dependency; scope to high-stakes/irreversible verification. → `../backlog/cross-family-quorum.md`. *(A)*

---

## Tier 3 — defer (until upstream is decided)

- **Episodic / session memory** — design after the navigability + substrate direction is set. *(Memory)*
- **Memory substrate** (markdown vs SQLite+FTS5/sqlite-vec vs graph) — downstream of requirements; do NOT pre-pick. *(Memory)*
- **MAS dispatch thresholds** — calibrate the fan-out value/parallelism bar on real workloads. *(C)*

---

## Open research BEFORE certain builds
- **CoT faithfulness** — before any auditable decision-trace feature (a confident-but-unfaithful trace is worse than none).
- **Capability-registry / self-knowledge** — before capability-aware escalation (the shoes/house pattern); likely structural, not model self-report.
- **Track E** — does single-agent-under-matched-budget hold on tool-heavy / long-horizon ("any domain") work, not just text reasoning?

---

## Cross-cutting durability note
Everything durable here is **META-scaffolding that compensates for a model self-blindness** (verification, resource-governance, guardrail-audit, memory-governance) or **constraint/structure design**. Transient — don't over-invest: prompt *wording*, hand-tuned few-shot, bespoke retrievers, specific numeric thresholds. This is the through-line as an investment filter: build the oversight harness; rent the wording.
