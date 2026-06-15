# ADR-0003 — Design interaction model: research-as-dialogue vs produce-then-confirm

**Status:** Proposed (2026-06-15) — **awaiting operator decision.** Triggered by the E19 pilot (ADR-0002's fidelity experiment). Not a reversal of ADR-0002: it resolves a question ADR-0002 never addressed — the *interaction shape* of `/sk-design`. **Gates the sk-design / orchestrator slice of EPIC E3** (the audit can't fix sk-design until the target shape is decided). Relates E8 (sizing signal), E11 (operator-dial / budget), E18 (design deliverable shape). New EPIC item: **E23**.

## Context

The E19 pilot ran `/sk-design --research` twice on a real ticket (`epic-2-procgen`). Both produced sound RFCs. But the load-bearing operator observation was about *how* it got there, not the output:

- The flow is **produce-then-confirm**. sk-explorer scopes → research runs → it is silently synthesised into an RFC → the operator is then handed multiple-choice decision gates to ratify (eight of them in run 2), each with a pre-baked "Recommended" pick. The research findings are **never surfaced for discussion before they crystallise into the RFC**.
- ADR-0002 positioned sk-design as the replacement for superpowers **brainstorming**. Brainstorming is dialogic; sk-design kept the *artifact* and lost the *dialogue*. The operator: *"research is there so we can have an informed discussion"* — and that discussion currently doesn't happen.
- Compounding it: sk-explorer's `complexity` is a **silent gate** (low skips research, medium/high run it) and is **non-deterministic** (high/medium/high on the same ticket across three runs). The operator wants complexity to be a **signal to them** ("a lot here / little here") that informs whether to dig in or move fast — not a hidden routing decision.

Evidence: [`../backlog/platform-primitives-scoping.md`](../backlog/platform-primitives-scoping.md) Pilot findings **F3, F4, F5, F9**.

## Decision — PROPOSED (options, not yet chosen)

**The question:** what is the *default* interaction shape of `/sk-design`, and where does the operator enter the loop?

**Option A — Status quo (produce-then-confirm).** Scope → research → synthesise → draft RFC → surface decision gates → operator confirms/edits.
*Pro:* fast, low-touch, fully autonomous; good when the operator already trusts the direction. *Con:* research is a silent input; the operator can't shape the framing before it sets; "informed discussion" never happens; recommendation non-determinism surfaces only as surprises at the gate.

**Option B — Dialogue-by-default; `--auto` opts into A.** Default surfaces what research found (synthesis, live decisions, the actual options) **for discussion before the RFC is drafted**; the RFC is co-produced from that exchange. `--auto` runs today's one-shot path for hands-off work.
*Pro:* research does its job (enables an informed decision); matches the brainstorming intent; mis-framing is caught early (cheaper than RFC rework). *Con:* slower, higher-touch by default; a genuine interaction redesign of sk-design's step flow, not a prompt tweak.

**Option C — Complexity-gated entry (B for deep topics, A for shallow), operator-visible.** A surfaced complexity signal decides whether to open a dialogue or one-shot; operator can override in chat.
*Pro:* spends interaction budget where warranted. *Con:* leans on the complexity classifier the pilot proved noisy (F3) — an unreliable gate unless the signal is fixed first; risks recreating the silent-gate problem.

**Recommendation (operator decides):** **Option B as default, taking C's complexity-as-a-*surfaced-signal*** — the operator sees "how much is here" but is never auto-routed by it. Rationale: design is the step where thinking should be shared; **autonomy is the opt-in (`--auto`), not the default.** Fix the complexity signal first (F3 — collapse the noisy three-bucket to a surfaced `should_research` + a depth note) so it informs rather than silently routes.

## Sub-decisions to resolve (the real content)

1. **Default:** dialogue or one-shot? (recommend dialogue; `--auto` = one-shot)
2. **Where the dialogue happens:** after research synthesis, **before** the RFC draft (recommend) — so findings are discussed before they set.
3. **What gets surfaced:** the synthesis + the live decisions + **the actual options laid out** (fixes F5) + the open questions **enumerated** (fixes F5).
4. **Complexity as signal, not gate** (F3): surface "how much is here"; stop using it as a hidden research on/off switch.
5. **Mid-conversation budget** (F9): let the operator fire/re-fire research at a chosen budget *during* the dialogue, not only via an upfront flag. (Down-payment on E11 — decide if in-scope for the first cut or deferred.)
6. **Relationship to the existing `AskUserQuestion` gates:** keep a lightweight final confirm after dialogue, or replace them? (recommend: keep a light final confirm; the dialogue replaces the *decision-by-multiple-choice* feel.)

## Consequences (of the recommended direction)

- sk-design's step flow is reworked (research → **surface + discuss** → draft) and the orchestrator's dispatch/gate prose changes. **This is the bulk of the E3 sk-design audit — so ADR-0003 must land before it.**
- sk-explorer's `complexity` output changes (F3) → feeds **E8** (externalize the sizing signal; "escalate-to-human" is one of its options).
- Mid-conversation budget selection is a down-payment on **E11** (operator-dial).
- Higher default interaction cost; the `--auto` escape hatch bounds it.
- *Risk:* a dialogic default could feel chatty on trivial tickets — mitigated by the surfaced complexity signal steering depth and `--auto` for hands-off work.

## What's needed to decide

Operator's call on sub-decisions 1–6 — especially the **default** (1) and whether **mid-conversation budget** (5) is in the first cut or deferred to E11. Everything else follows.

## Links

[`0002-platform-primitives-scoping.md`](./0002-platform-primitives-scoping.md) (this is its pilot's downstream decision) · [`../backlog/platform-primitives-scoping.md`](../backlog/platform-primitives-scoping.md) (Pilot findings F3/F4/F5/F9) · [`../EPIC.md`](../EPIC.md) (E23; gates E3; relates E8/E11/E18)
