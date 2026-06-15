# ADR-0002 — Platform primitives: own the loop, rent the fan-out

**Status:** Accepted (2026-06-10). Resolves **EPIC E2**; unblocks E4/E5/E13/E17/E18; spawns E19–E22. **Follow-on:** the E19 pilot (this ADR's fidelity experiment) surfaced a distinct design-interaction question → [ADR-0003](./0003-design-interaction-model.md) (Accepted 2026-06-15; EPIC E23).

## Context

Claude Code now ships the loop/orchestration cluster (dynamic Workflows — **GA May 2026** — hooks, `/goal`, `/loop`, agent-view). E2 asked what to offload to the platform vs keep hand-rolled, and what sidekick adds on top. Two dedicated research tracks ground this decision: [`../research/platform-coupling/REPORT.md`](../research/platform-coupling/REPORT.md) (coupling posture; verified platform facts) and [`../research/enforcement-surface/REPORT.md`](../research/enforcement-surface/REPORT.md) (gate layering, sealing, generated enforcement), on top of [`../research/agentic-loops/REPORT.md`](../research/agentic-loops/REPORT.md) and [`../research/orchestration/REPORT.md`](../research/orchestration/REPORT.md). Discussion state: [`../backlog/platform-primitives-scoping.md`](../backlog/platform-primitives-scoping.md).

Load-bearing verified facts (2026-06-10, several first-hand): workflows allow **no mid-run user input** (the docs' own sign-off pattern is humans *between* workflows); workflow **resume is same-session only**; workflow scripts have **no shell/fs access** (in-workflow gates are agent claims); workflow subagents always run **`acceptEdits`** (write prompts gone); **hooks fire inside workflow agents** and a PreToolUse deny blocks tools **even under `bypassPermissions`** (tighten-only asymmetry); `/goal`'s evaluator is a fixed same-family Haiku judge over conversation surface; Workflows are version-gated (≥ v2.1.154), **off-by-default on Pro**, org-disableable with **no fallback**; Anthropic documents skill→workflow conversion as a **one-prompt operation** (deferring coupling is cheap).

Consumer posture: operator's own projects today; **a few testers cloning the repo near-term** (repo docs must onboard them); possible publication later.

## Decision

1. **Value thesis.** sidekick's durable value is (a) the **oversight layer** — gates, independent verification, escalation, cross-session resume/recovery, context discipline — and (b) the **design layer that generates per-project structure** (plans, gates, enforcement). Orchestration *mechanics* are progressively rented from the platform. (Everything the platform structurally lacks is exactly this list; historical precedent — Assistants/plugins/Agent-Builder kills, the Zapier hedge — punishes coupling value to a vendor orchestration primitive.)

2. **Substrate per workload** (not one answer):
   - **Interactive write-path (`sk-build`): keep hand-rolled — and shrink it.** Deviation routing, cross-session resume, and FRESH deterministic gates are structurally absent in workflows. The keep is conditional: move more determinism into the CLI (e.g. the Q1 heuristics table), cut state-machine prose via the E3 audit.
   - **Within-wave verification fan-out: status quo** (parallel `Agent` calls; Workflow buys nothing at `waveSizeCap` 4).
   - **Breadth-only read-only fan-out (research sweeps, audits, multi-angle review): rent.** Workflow becomes an optional backend behind a seam (below) — read-only work, so `acceptEdits` doesn't bite, and plan-in-script context isolation is a real win. **Pilot one workload now** (research fan-out), instrumented — doubles as the fidelity/absorption experiment.

3. **Renting mechanics** (no platform state in our artifacts): a **capability probe** in the CLI (`sidekick capabilities`: CC version, `disableWorkflows` from the settings hierarchy; undetectables → documented limits); a **config knob** `.sidekick/config.json` `fanout: { backend: auto|workflow|agents, budget: <tier> }`; **seams in skills** (dispatch steps reference "the configured backend", never Workflow semantics — same shape as sk-build's M4 worktree seam); **guidance** on when fan-out is justified at all (the value bar), backend-independent.

4. **Budget tiers (operator concern: a 2-run research session consumed ~5.9M tokens).** Fan-out cost is a first-class knob, not an afterthought: `quick` (single agent, no quorum) / `standard` (parallel angles, single-vote verify) / `deep` (full adversarial quorum). **Default `standard`; `deep` is explicit opt-in.** Tiers gate verification depth, not just agent count (that's where the ~15× multiplier lives). Down-payment on E11, which still owns autonomy/risk/blast-radius.

5. **Enforcement surface — layered, each check at the lowest layer that holds it:**
   - **Tier 0 (deterministic):** `sidekick init` optionally installs a minimal hooks base — PreToolUse deny for the safety tier (protect gate definitions + frozen RFC sections) and the Stop-hook working-tree scan (closes the documented Bash-bypass gap; the only always-on write gate inside workflows). Only rules that are never wrong.
   - **Tier 1 (prompted discipline, `rules/`):** reclassified honestly as *guidance, not enforcement* (anti-cheat prompts left 70–95% leak-through). Consumer-extensible — rules are opinionated/personal. **Run as an experiment**: leak data is its exit criterion.
   - **Tier 2 (dimensional verifier agents):** existing sk-* reviewers, with an evidence-based ceiling (~80–90% catch at 5% FPR) — never the last line.
   - **Tier 3 (human):** deviation routing; escalate on irreversible ∧ low-confidence.
   - **Tier mobility:** a tier-1 rule that keeps leaking gets *promoted* to a tier-0/2 backstop; absorption instrumentation can *demote* gates a newer model no longer needs.
   - **Generated enforcement** (per-project hooks/agents/gates derived from project+objective) is a **future EPIC item**, not built now — requires: independent calibration before a generated gate binds (producer≠verifier recurses), intent-anchored regeneration on drift triggers (naive regeneration encodes stale behavior), anti-mock + integration-check dimensions. Consumes E13's rubric tiering.
   - **Sealing posture:** local hooks are tamper-*resistant*, not tamper-proof (documented bypass issues). Binding/safety-tier gates move out of the agent's write surface (org-managed settings → CI-side) when stakes demand; the rest is **documented limits + hardening guidance** — operator guidance is a first-class deliverable.

6. **Coupling posture:** defer coupling everywhere not covered above (the one-prompt-conversion asymmetry makes waiting ~free); ship the **consumer docs + limits doc now** (testers onboard through them); declare **minVersion at publish** (verify CC manifest enforcement then); run the **absorption checklist** on every CC/model upgrade (durability filter as an ongoing check).

7. **Instrumentation:** local-only gitignored JSONL usage log via the hooks base — task/wave counts (task-size proxy for ADR-0001's assumption), fan-out runs (backend, tier, tokens, outcome — feeds E8 sizing, E17 thresholds, and budget-tier calibration).

### Per-primitive scoping table

| Primitive | Posture | Why / trigger to revisit |
|---|---|---|
| **Workflow (dynamic workflows)** | **Rent** for read-only breadth fan-out, behind the seam + probe + budget knob. Not for the write path. | Revisit write-path offload when: cross-session resume ships, OR E13 gates exist CI-side, OR ecosystem adoption signal appears (~quarterly re-probe; zero evidence today). |
| **Hooks** | **Build on** — the tier-0 deterministic base; the one layer enforced under both substrates. | Agent hooks are experimental — command hooks only for now. Re-verify semantics each CC upgrade. |
| **`/goal`** | **Ignore as substrate; track as target.** Fixed same-family Haiku judge, conversation-surface only — fails our gate-independence bar. | E12 (cross-family quorum) is its upgrade path; revisit if the evaluator becomes configurable. |
| **`/loop`** | **Ignore** — no current workload. | Revisit if a recurring-maintenance use case lands. |
| **Agent-view / background sessions / worktrees** | **Use opportunistically, no coupling** — session-level conveniences. | — |
| **`ultracode`** | **Track only** — experimental, session-scoped. | Revisit on stabilisation. |

## Consequences

**Positive:** unblocks E4/E5/E13/E17/E18 with a concrete frame; sk-build keeps its safety properties while shedding prompt-encoded state machinery; fan-out gets cheaper-by-default (budget tiers) and platform-accelerated where it's safe; enforcement gains a deterministic floor; the durability filter becomes operational practice (probe + checklist + instrumentation).

**Negative / costs:** a pilot + probe + hooks base + docs refresh is real near-term work (three new EPIC items); the hand-rolled write-path loop remains ours to maintain (accepted: it is the product); tier-1 discipline may prove leakier than useful (accepted as an experiment with exit criteria); the rented backend can churn (mitigated: seam + fallback + revisit triggers).

**EPIC deltas (applied with this ADR):** E2 → done; E17 reframed (calibrate dispatch into the rented backend; budget tiers); E18 narrowed (workflow-emission applies to read-only fan-out only; the prose plan stays the write-path artifact); new items: **E19** (fan-out seam + capability probe + budget tiers + pilot + consumer/limits docs), **E20** (tier-0 hooks base; substrate for E9's forcing-function), **E21** (usage instrumentation), **E22** (generated enforcement + tier mobility; deps E13/E20).

## Assumptions (revise if wrong)

- Workflows' GA status holds and the disable/plan gates don't tighten further (probe + fallback bound the damage if they do).
- Read-only fan-out is a real recurring workload for consumers (the pilot + instrumentation test this).
- The budget-tier defaults are guessable now and calibratable from instrumentation (E21) — they are placeholders until data exists.
- Testers tolerate documented limits in lieu of engineered fallbacks for what can't be detected (plan gating).

## Revisit when

- Any per-primitive trigger in the table fires.
- The absorption checklist flags a flipped scaffold (a gate or seam gone net-negative after an upgrade).
- Task-size data (E21) contradicts ADR-0001's assumption — lean behavioural harder, and the fan-out bar moves.
- Publication becomes concrete — minVersion, fallback hardening, and the limits doc graduate from guidance to requirements.

## Links

[`0001-harness-shape.md`](./0001-harness-shape.md) (this ADR executes 0001's "platform shift strengthens the oversight direction" note) · [`../research/platform-coupling/`](../research/platform-coupling/REPORT.md) · [`../research/enforcement-surface/`](../research/enforcement-surface/REPORT.md) · [`../research/platform-landscape.md`](../research/platform-landscape.md) (2026-06-10 correction note) · [`../backlog/platform-primitives-scoping.md`](../backlog/platform-primitives-scoping.md) · [`../EPIC.md`](../EPIC.md)
