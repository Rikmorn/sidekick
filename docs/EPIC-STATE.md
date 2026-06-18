# EPIC State — live snapshot (2026-06-18)

The "where are we right now" view. Complements [`EPIC.md`](./EPIC.md): the **roadmap, phase ordering, and crosswalk live there**; this doc holds the live status, the current architecture, the open coherence debt, and the pending decisions. IDs are `{phase}.{item}` (see EPIC.md for the legacy `E#` crosswalk). Regenerate when the picture blurs.

---

## TL;DR

**Architecture is settled** (three accepted ADRs). **The toolchain is built and works** — 6 orchestrator skills + 24 agents + 9 CLI helpers + a tier-0 hook. **Phase 0 is complete**; we are in **Phase 1** — finishing the toolchain audit and clearing the coherence debt the 2026-06-18 drift sweep surfaced. Phases 2–5 are unstarted.

**The thing that triggered this re-baseline:** the per-slice audits ran *one lens* (prose-discipline) when the toolchain needs *two*. **~10 of 24 agents carry architectural-coherence debt** — self-descriptions that drifted when `0.4` (the sk-design dialogue rework) moved the ground under the agents it dispatches. Bounded, one root cause, mostly mechanical, two real bugs. It's a **pattern, not a one-off** — which is why Phase 1 opens with a dedicated reconciliation pass (`1.1`) before more behaviour-change work lands.

---

## 1. The frame

This EPIC applies the research-program learnings to the harness itself. Durability filter: **build the oversight harness, rent the wording** — own the loop/gates/verification/escalation; treat prompt phrasings as rentable and re-checkable per model generation. Product surface: `agents/`, `skills/`, `bin/` (CLI kernel), and `.claude/rules/sk-agent-prompts.md`.

---

## 2. Architecture as it stands — the three ADRs

| ADR | Decision | Status |
|---|---|---|
| **0001** | **Harness shape** — behavioural-leaning; the lifecycle is a thin skeleton, not a rigid state machine. Execution gated on the eval layer (`4.1`). | Accepted as direction (2026-06-07) |
| **0002** | **Own the loop, rent the fan-out** — the write-path loop (sk-build) stays hand-rolled and *shrinks*; read-only breadth fan-out (research) rents Workflow behind a seam + probe + budget tiers; hooks are the tier-0 base. | Accepted (2026-06-10) |
| **0003** | **Design = dialogue-by-default** — `/sk-design` explores *with* the user; `--auto` is hands-off; complexity is a *surfaced signal, not a silent gate*. | Accepted (2026-06-15) |

**ADR-0003 (`0.4`) is the load-bearing recent change** — it rewrote `/sk-design` and is the source of the coherence debt in §4. The one open architecture question — repurposing `sk-explorer` — is **ADR-0004** (pending, item `1.2`).

### The shipped toolchain (the lifecycle)

```
/sk-design   (dialogic)  → explorer · branch-precheck · pattern-mapper · architectural-advisor
                            · researcher-{impl,decision,context} → research-synthesiser
                            · rfc-drafter · plan-drafter  +  RFC/PLAN quorum
                            (structural · crossref · coherence)        → writes RFC.md / PLAN.md / RESEARCH.md
/sk-build                → branch-precheck · executor · spec-reviewer   (+ classify-deviation CLI)  → executes PLAN tasks
/sk-review               → correctness · security · maintainability · test · architecture · goal-verifier  (+ fixer on --fix)
/sk-decide               → decision-drafter  +  decision quorum (structural · coherence)              → .sidekick/decisions/<slug>.md
/sk-goal-verify          → goal-verifier
/sk-regen-plan           → plan-reconciler   (+ reconcile-plan · wave-plan CLI)
tier-0 enforcement       → config-guard hook (hooks.ts), installed opt-in by `sidekick init`
```

- **6 orchestrator skills** (slash commands — orchestrators must live here; subagents can't dispatch subagents).
- **24 agents** (subagents, tool-restricted), grouped by role in §4 / EPIC.md.
- **9 CLI helpers** (the "own the loop" kernel, TDD'd): `branch-precheck`, `capabilities`, `check-drift`, `classify-deviation`, `config`, `hooks`, `init`, `reconcile-plan`, `wave-plan`.

---

## 3. Where we are in the roadmap

**Phase 0 ✅ done** · **Phase 1 → in progress** · Phases 2–5 unstarted. Full phased roadmap + per-item sources/deps: [`EPIC.md`](./EPIC.md).

Phase 1 (current) at a glance:

| Item | Work | Status |
|---|---|---|
| **1.1** | Coherence reconciliation (the §4 debt) + blast-radius guard | next |
| **1.2** | Explorer/pattern-mapper rethink → **ADR-0004** (folds in F3) | pending |
| **1.3** | Research-quality F4/F7 → Researchers group done | pending |
| **1.4** | Rules group (4) | pending |
| **1.5** | Utility (branch-precheck, F2) → **toolchain audit complete** | pending |

---

## 4. Coherence debt — drift sweep (2026-06-18)

A three-auditor sweep checked all 24 agents against the **current orchestrators** (not the discipline doc). The per-slice audits were blind to this dimension. **~10 agents drifted; one dominant root cause — the `0.4` `/sk-design` rewrite moved the ground under the agents it dispatches and they were never reconciled.** Most is contract-hygiene/cosmetic; two are real functional issues. This is the `1.1` work-list.

| Agent | Class | Drift |
|---|---|---|
| **sk-explorer** | VESTIGE | Pre-`0.4` cold scoper front-running the now-dialogic sk-design; emits the broken `low\|medium\|high` self-rating. *(Started this whole thread → `1.2`.)* |
| **sk-pattern-mapper** | VESTIGE + stale-ref | Self-describes a `--resume`/amend dispatch sk-design no longer has; **reads `./docs/decisions/*.md`** (toolchain uses `.sidekick/decisions/`) → **silent no-op, loses analogue grounding**. |
| **sk-rfc-drafter** | latent-incoherence | Keys "omit Research notes" off `complexity: low`, **contradicting its own line** that keys off `synthesis_output`. `complexity` otherwise inert. **Real bug.** |
| **sk-researcher-{context,decision,impl}** | stale-ref ×3 | "Dispatched by /sk-design **Step 5**" + a ghost "Researchers-T-08" contract; no Steps exist post-`0.4`. |
| 3 researchers + **synthesiser** | latent-incoherence | `duration_ms` self-timing is **fabricated telemetry** (an LLM can't measure wall-clock); flows through contracts, nothing reasons on it. |
| **sk-research-synthesiser** | latent-incoherence | 2 of 3 `synthesis_target` modes unreachable; cites `## Comparative analysis` (RFC now `## Research notes`); `short_synthesis` computed, never consumed. |
| **sk-spec-reviewer** | stale-ref | Hard-codes "Step 5"; current sk-build runs it in **Step 6** (the sk-executor off-by-one, un-propagated to its sibling). |
| **sk-decision-drafter** | latent-incoherence | Names only `sk-structural-checker`; sk-decide now runs a structural **+ coherence** quorum. |
| sk-plan-drafter | stale-ref (minor) | Calls `rfc_hash` "SHA-256"; it's `git hash-object` (SHA-1). Cosmetic. |

**~14 agents are clean** — every dimensional reviewer, the checkers, advisor, branch-precheck, executor (the earlier fix held), fixer, goal-verifier, plan-reconciler.

**Process lesson (→ the `1.1` guard):** a big-bang orchestrator rewrite (`0.4`) left reconciliation debt because nothing reconciled its blast radius atomically, and the follow-on audits used the wrong lens. Candidate guard: *when an orchestrator's flow/contracts change, reconcile every agent it dispatches in the same change* — and/or a cheap standing check (no agent cites a "Step N"; every agent's named dispatcher/verifier matches the live orchestrator).

---

## 5. Open decisions pending

- **Explorer-role rethink** (`1.2`, → **ADR-0004**) — agreed *direction*: repurpose sk-explorer to a **repo-grounding / scope-evidence** subagent that sk-design *calls*; move scoping (slug, single-vs-group) into sk-design's dialogue, where it belongs post-`0.4`. Entangles F3 and absorbs F4's thin-repo grounding. Not yet specced.
- **F3 — explorer's signal** — *decided 2026-06-18*: drop the `low\|medium\|high` difficulty bucket for an **evidence-grounded signal** (analogues found / prior decisions / new libraries), grounded in `agentic-loops` (self-assessed difficulty is broken) + `reasoning-capability` F5. Leaves a clean seam for `3.1` (E8); does not pre-build it.
- **F4 / F7** (`1.3`, independent of the explorer question) — F4: make brief construction explicit + surface briefs + flag thin-repo grounding. F7: researcher/synthesiser output should mark interchangeable specifics as substitutable so run-to-run drift reads as examples, not mandates.
- **`4.1` (eval keystone) pull-forward** — flagged at the Phase 2→3 **checkpoint** in EPIC.md; decide explicitly there.
- **Work-item documentation format** — the meta-gap behind this whole re-baseline; backlogged at [`backlog/work-item-doc-format.md`](./backlog/work-item-doc-format.md).

---

## 6. Where to look

- **Roadmap, phase ordering, crosswalk, execution log:** [`EPIC.md`](./EPIC.md)
- **Architecture decisions:** [`adr/`](./adr/) (0001 shape · 0002 platform · 0003 design-interaction; 0004 explorer-rethink pending)
- **Pilot findings F1–F10:** [`backlog/platform-primitives-scoping.md`](./backlog/platform-primitives-scoping.md)
- **Open backlog:** work-item-doc-format · cross-family-quorum (`4.3`) · operator-dial-tooling (`4.2`) · usage-instrumentation (E21) · gate-command-defaults · install-config-dir-divergence
- **Research program:** [`research/README.md`](./research/README.md) — most cross-cutting are `agentic-loops` and `reasoning-capability`
- **Authoring discipline:** [`.claude/rules/sk-agent-prompts.md`](../.claude/rules/sk-agent-prompts.md)
