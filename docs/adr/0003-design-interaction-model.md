# ADR-0003 — Design interaction model: research-as-dialogue vs produce-then-confirm

**Status:** Accepted (2026-06-15, operator sign-off). Triggered by the E19 pilot (ADR-0002's fidelity experiment). Not a reversal of ADR-0002: it resolves a question ADR-0002 never addressed — the *interaction shape* of `/sk-design`. **Implemented by EPIC E23** (the sk-design interaction rework), which the sk-design slice of E3 folds in. Relates E8 (sizing signal), E11 (operator-dial / budget), E18 (design deliverable shape).

## Context

The E19 pilot ran `/sk-design --research` twice on a real ticket (`epic-2-procgen`). Both produced sound RFCs. But the load-bearing operator observation was about *how* it got there, not the output:

- The flow is **produce-then-confirm**. sk-explorer scopes → research runs → it is silently synthesised into an RFC → the operator is then handed multiple-choice decision gates to ratify (eight of them in run 2), each with a pre-baked "Recommended" pick. The research findings are **never surfaced for discussion before they crystallise into the RFC**.
- ADR-0002 positioned sk-design as the replacement for superpowers **brainstorming**. Brainstorming is dialogic; sk-design kept the *artifact* and lost the *dialogue*. The operator: *"research is there so we can have an informed discussion"* — and that discussion currently doesn't happen.
- Compounding it: sk-explorer's `complexity` is a **silent gate** (low skips research, medium/high run it) and is **non-deterministic** (high/medium/high on the same ticket across three runs). The operator wants complexity to be a **signal to them** ("a lot here / little here") that informs whether to dig in or move fast — not a hidden routing decision.

Evidence: [`../backlog/platform-primitives-scoping.md`](../backlog/platform-primitives-scoping.md) Pilot findings **F3, F4, F5, F9**.

## Decision (accepted)

**Default `/sk-design` is dialogue.** After research, it surfaces what was found — the synthesis, the live decisions, the options laid out, the open questions enumerated — and discusses before drafting the RFC. **`--auto` opts into the one-shot produce-and-confirm path** (today's behaviour) for *"I trust it / I only care about the end result, not the artifacts themselves."* **Complexity becomes a surfaced signal** ("a lot here / little here"), never a silent routing gate (F3). **Mid-conversation budget selection is deferred to E11** (operator-dial), not in E23's first cut.

### Options considered

**The question was:** what is the *default* interaction shape of `/sk-design`, and where does the operator enter the loop?

**Option A — Status quo (produce-then-confirm).** Scope → research → synthesise → draft RFC → surface decision gates → operator confirms/edits.
*Pro:* fast, low-touch, fully autonomous; good when the operator already trusts the direction. *Con:* research is a silent input; the operator can't shape the framing before it sets; "informed discussion" never happens; recommendation non-determinism surfaces only as surprises at the gate.

**Option B — Dialogue-by-default; `--auto` opts into A.** Default surfaces what research found (synthesis, live decisions, the actual options) **for discussion before the RFC is drafted**; the RFC is co-produced from that exchange. `--auto` runs today's one-shot path for hands-off work.
*Pro:* research does its job (enables an informed decision); matches the brainstorming intent; mis-framing is caught early (cheaper than RFC rework). *Con:* slower, higher-touch by default; a genuine interaction redesign of sk-design's step flow, not a prompt tweak.

**Option C — Complexity-gated entry (B for deep topics, A for shallow), operator-visible.** A surfaced complexity signal decides whether to open a dialogue or one-shot; operator can override in chat.
*Pro:* spends interaction budget where warranted. *Con:* leans on the complexity classifier the pilot proved noisy (F3) — an unreliable gate unless the signal is fixed first; risks recreating the silent-gate problem.

**Chosen (operator, 2026-06-15): Option B as default, taking C's complexity-as-a-*surfaced-signal*** — the operator sees "how much is here" but is never auto-routed by it. Rationale: design is the step where thinking should be shared; **autonomy is the opt-in (`--auto`), not the default** (`--auto` = "I trust it / I only care about the end result, not the artifacts"). Fix the complexity signal first (F3 — collapse the noisy three-bucket to a surfaced `should_research` + a depth note) so it informs rather than silently routes.

## Sub-decisions

(1 and 5 are settled by the operator; 2/3/4/6 are the accepted direction above, finalized when E23 implements the rework.)

1. **Default — DECIDED:** dialogue; `--auto` = one-shot produce-and-confirm.
2. **Where the dialogue happens:** after research synthesis, **before** the RFC draft (recommend) — so findings are discussed before they set.
3. **What gets surfaced:** the synthesis + the live decisions + **the actual options laid out** (fixes F5) + the open questions **enumerated** (fixes F5).
4. **Complexity as signal, not gate** (F3): surface "how much is here"; stop using it as a hidden research on/off switch.
5. **Mid-conversation budget** (F9) — **DEFERRED to E11** (operator-dial); not in E23's first cut. Until then, budget is set via the upfront flag/config as today.
6. **Relationship to the existing `AskUserQuestion` gates:** keep a lightweight final confirm after dialogue, or replace them? (recommend: keep a light final confirm; the dialogue replaces the *decision-by-multiple-choice* feel.)

## Consequences (of the recommended direction)

- sk-design's step flow is reworked (research → **surface + discuss** → draft) and the orchestrator's dispatch/gate prose changes. **This is the bulk of the E3 sk-design audit — so ADR-0003 must land before it.**
- sk-explorer's `complexity` output changes (F3) → feeds **E8** (externalize the sizing signal; "escalate-to-human" is one of its options).
- Mid-conversation budget selection is a down-payment on **E11** (operator-dial).
- Higher default interaction cost; the `--auto` escape hatch bounds it.
- *Risk:* a dialogic default could feel chatty on trivial tickets — mitigated by the surfaced complexity signal steering depth and `--auto` for hands-off work.

## Status of open points

The two load-bearing calls are made (default = dialogue; mid-conversation budget → E11). Sub-decisions 2/3/4/6 are the accepted direction above and get finalized when **E23** implements the rework (and the E3 sk-design audit folds it in).

## Links

[`0002-platform-primitives-scoping.md`](./0002-platform-primitives-scoping.md) (this is its pilot's downstream decision) · [`../backlog/platform-primitives-scoping.md`](../backlog/platform-primitives-scoping.md) (Pilot findings F3/F4/F5/F9) · [`../EPIC.md`](../EPIC.md) (E23; gates E3; relates E8/E11/E18)
