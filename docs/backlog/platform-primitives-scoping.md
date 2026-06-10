# E2 — Platform-primitives scoping decision (working notes)

**Status:** DECIDED (2026-06-10) — superseded by [`../adr/0002-platform-primitives-scoping.md`](../adr/0002-platform-primitives-scoping.md). Kept as the discussion trail (decision decomposition, flags, operator inputs). Brainstorm outcomes folded into the ADR: D1 thesis adopted; D2 progressive enhancement + pilot (with budget tiers after the operator's 5.9M-token flag); D3 four-tier surface + tier mobility (operator) + generated enforcement deferred to E22; D4 thin seams + probe now, minVersion at publish, limits docs now (testers incoming); D5 ADR + EPIC deltas (E19–E22 added); D6 instrumentation = E21.

**Inputs:** [`../research/platform-landscape.md`](../research/platform-landscape.md) (now partially outdated — see verified facts), [`../research/agentic-loops/REPORT.md`](../research/agentic-loops/REPORT.md), [`../research/orchestration/REPORT.md`](../research/orchestration/REPORT.md), and two new tracks launched 2026-06-10: [`../research/platform-coupling/FRAMING.md`](../research/platform-coupling/FRAMING.md) + [`../research/enforcement-surface/FRAMING.md`](../research/enforcement-surface/FRAMING.md) (deep-research runs in flight; REPORTs land in those dirs).

## The decomposition

E2 bundles three separable decisions (different evidence needs, different reversibility):

1. **Value thesis** — confirm/revise: sidekick's durable value = the oversight layer (gates, verification, dial, escalation, resume/recovery) on top of platform loops. This is what E4/E5/E13/E17/E18 actually inherit.
2. **Substrate per workload** — sk-build's interactive write-path vs verification fan-out vs breadth-only read phases may deserve *different* answers (offload / keep / hybrid), not one.
3. **Coupling posture** — minVersion, behavior when Workflows disabled, absorption instrumentation, consumer guidance.

Refined decision list for the brainstorm:

- **D1** value thesis (above).
- **D2** substrate per workload.
- **D3** enforcement surface — layered + generated (see below), and where the deterministic tier lives (hooks/CI vs orchestrator prompt discipline).
- **D4** coupling posture + documented-limits guidance.
- **D5** E2's deliverable shape — proposal: **ADR-0002** with a per-primitive scoping table (offload / build-on-top / ignore / track per: Workflow, /goal, /loop, hooks, agent-view) + explicit revisit triggers, mirroring ADR-0001.
- **D6 (sub-decision)** task-size instrumentation — ADR-0001's task-size assumption is unmeasured and not web-researchable; instrument real sk-* usage so the dial/threshold decisions (E6/E8/E11, E18's "key open tension") get data.

## Verified platform facts (2026-06-10 guide-agent pass; full list in platform-coupling FRAMING)

Headlines: Workflows **stable** since May 2026 (landscape doc outdated); **no mid-run user interaction**; **resume same-session only** (cross-session recovery stays ours); workflow scripts have **no shell/fs access** (in-workflow gates become agent claims); **hooks fire inside workflow-spawned agents** (deterministic enforcement below both substrates); custom `agentType` reusable; `/goal` evaluator = fixed Haiku, conversation-surface-only (not a gate substrate); `disableWorkflows` has no documented fallback; plugins can declare CC `minVersion`, no "requires Workflows" flag.

## Flags raised (pre-research), with verification updates

1. Existing research answers "loop vs no loop," not "whose loop" — the build-vs-buy/coupling gap → now the platform-coupling track.
2. Interactivity mismatch is load-bearing: sk-build's deviation routing (Q1 contract) is the structural human-escalation primitive; workflows are detached. **Strengthened** by same-session-only resume.
3. Offloading to Workflow may *weaken* gate independence (script can't run Bash; gates become subagent claims). **Mitigation verified:** hooks as the deterministic layer under both substrates — arguably stronger than prompt-level "run the gate FRESH" discipline.
4. Counter-evidence to wholesale offload: writes are deliberately sequential (no-parallel-writers), so Workflow's headline wins land on read/verify fan-out; the prompt-encoded state machine in sk-build is the part our own discipline calls an anti-pattern → third option: **keep the slash command, shrink it** (more determinism into CLI, strip state-machine prose).
5. Churn risk **downgraded** (Workflows GA) but converted into a *distribution* risk (disableWorkflows, no fallback, consumer CC versions). ultracode still experimental.
6. Task-size assumption still unmeasured → D6.
7. E2's output artifact was undefined → D5.

## Operator inputs from discussion (2026-06-10) — do not lose

- **Tooling is extensible**: the bundled CLI can grow where justified (consistent with "determinism in code"). For memory specifically, E10/E15 already own the store question — navigability-over-markdown first (AMA-Bench: engineered memory −40% vs long context); don't pre-pick a semantic store.
- **Enforcement surface reframe** (operator): not a single gate — a **base minimum + prompted discipline + extensible generated tier**. A skill examines the project/work/objective and *creates* enforcement mechanisms (per-project hooks, project-specific dimensional agents — e.g. security-minded). Generating the surface is itself a loop application. Precedents: gsd-nyquist-auditor (verifier manufacturing), gsd-eval-planner, codebase-analysis→recommended-automations pattern. Three shaping corrections accepted:
  1. **Producer≠verifier recurses**: gates generated by one invocation, independently reviewed/calibrated by another (or the operator for the safety tier); reward-hacking scales with worker visibility into the gate (METR).
  2. **Sealing bounds the design**: in-repo gate scripts are readable/editable by the gated agent; sound placement may require out-of-repo / managed settings / CI-side. (Track B A3.)
  3. **Generate + reconcile, not generate-once**: generated surfaces overfit generation-time project state (AFlow lesson transposed); needs a drift-trigger re-derivation loop (check-drift shape).
- **Document-the-limits posture** (operator): where a limit can't be engineered away (sealing, disabled Workflows, judge fallibility), *documenting the limit + operator guidance is itself a deliverable* — consumers make informed decisions or follow the minimisation guidance. "If 'read the output' is all we have, any invested operator should follow it — human-level guidance." This makes operator guidance a first-class output class of the harness, alongside gates.
- **The loop applies to the harness itself**: enforcement generation, gate calibration (E13), prompt meta-optimization (GEPA), memory reconciliation (E16), absorption instrumentation — all legitimate meta-applications, each gated by the bidirectional over-engineering dial (E6; reasoning F4/F5). Threshold-gate every meta-application (e.g. small projects don't get a generated security agent).

## Next steps

1. ✅ Research runs returned (2026-06-10) → `platform-coupling/{REPORT,sources}.md` + `enforcement-surface/{REPORT,sources}.md` written; load-bearing CC-docs quotes re-verified first-hand (workflows page + hooks-guide page).
2. ✅ Active docs updated: `platform-landscape.md` (2026-06-10 correction note), EPIC E2 row (links + status). Deferred until post-brainstorm: DESIGN-PRINCIPLES (enforcement/guidance reframes are not yet decisions).
3. **→ Brainstorm with real proposals per D1–D6 → ADR-0002.** Key research deltas to carry in: progressive-enhancement verdict + one-prompt-conversion asymmetry (coupling later is cheap); stage-per-workflow is the platform's own sign-off pattern; `acceptEdits` inside workflows ⇒ hooks are the only always-on write gate there; hooks' deny-asymmetry + Stop-hook tree-scan as the deterministic base; generated gates need independent calibration + intent-anchored reconciliation + anti-mock checks; escalation ergonomics and generated-non-test-gates remain evidence gaps (design conservatively, instrument).
