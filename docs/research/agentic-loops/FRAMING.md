# Agentic Loops — Research Framing

**Status:** Pre-research framing (2026-06-07). Captures what we already concluded in discussion + the open questions + the disconfirming angles to plant, *before* the deep-research sweep. Relationship: complements [`../orchestration/`](../orchestration/REPORT.md) (that track was multi-vs-single-agent + the format tax); **this track is the LOOP as the unit of work** — when an outer loop earns its keep, its gates, its convergence, and design-as-workflow.

## Why this research
Triggered by Boris Cherny's "I just write loops that prompt Claude" + the realization that Claude Code now ships the loop primitives ([`../platform-landscape.md`](../platform-landscape.md)). We've reasoned a lot already this session; this run grounds, expands, and *challenges* that reasoning against the literature — even where it repeats what we already believe (explicitly requested).

## What we currently believe (to confirm / challenge / enrich)
1. The **inner** agent loop (act→observe→act within one invocation) already exists for free. The **outer** written loop is a different thing.
2. **The outer loop is not a reasoning device — it's a context / independence / scale device.** It earns its keep on: (a) work bigger than one context window; (b) an *independent* gate the self-assessing agent can't provide; (c) unattended / parallel execution. Absent those → over-engineering ("prompting with extra steps").
3. Two loop topologies: **gate-driven** (iterate-until-programmable-gate; "thermostat") vs **failure-driven** (retry-on-verification-failure; "positive recursive loop").
4. **The gate is the hard part.** For fuzzy goals you can't specify it up front. Gates are fuzzy at the top, crisp at the leaves (decompose); "stop and ask the human" is a valid gate; no gate at all → don't loop, collaborate interactively.
5. More iterations is **non-monotonic** — past a threshold, over-processing flips net-negative (bidirectional dial; reasoning F4/F5).
6. Candidate direction: **design emits an executable workflow with concrete gates**, not a declarative plan — but proceduralize only the **META** (gates / fan-out structure / verification / escalation), never the **OBJECT** (the work stays a high-level `agent()` call), else it's rigidity / absorption (the gsd trap in TypeScript).
7. **Large-vs-small balance** is the key open tension; sizing-detection is itself the model's weak spot (can't self-assess budget — Track B).

## Core question
When does wrapping an LLM in an *outer programmatic loop* (vs. a single agentic invocation) actually improve outcomes — and how do you build the loop (its gates, its convergence, its context management, its escalation) well? Which parts are **durable** vs **absorbed** by stronger models?

## Angles (the sweep)
- **A1** Iterative self-improvement (Self-Refine / Reflexion / CRITIC) — does it work; intrinsic self-correction limits without external feedback.
- **A2** Gates / verifiers for open-ended goals — tests & execution feedback, LLM-as-judge reliability, rubrics, process vs outcome reward, generator-verifier gap.
- **A3** Convergence vs thrashing — stopping criteria; over-processing / over-thinking net-negative; diminishing returns of test-time iteration.
- **A4** Loop / agent pattern taxonomy — ReAct, plan-and-execute, plan-execute-replan, best-of-N / sampling, Tree-of-Thoughts, debate; inner-loop vs outer-loop.
- **A5** Plan-as-program / agentic workflow generation — flow engineering (AlphaCodium), LLM-generated DAGs, LangGraph / AutoGen / CrewAI, static vs dynamic workflows; rigidity & over-fitting failure modes.
- **A6** Long-horizon agents & context management — window limits, sub-agent isolation, compaction / handoff, memory across iterations; production long-running loops.
- **A7** When NOT to loop — cost/benefit, single-agent-at-matched-budget, adaptive compute / complexity routing, when one shot suffices.
- **A8** Human-in-the-loop vs autonomous loops — escalation, blast-radius, guardrails for unattended loops, interactive vs detached.
- **A9** Durability lens across all of the above (bitter lesson; reasoning models absorbing scaffolding).

## Disconfirming angles to plant (look hard for the negative)
- Maybe iterative self-refinement mostly **doesn't** work without external feedback → would dent the value of failure-driven loops; hunt the negative evidence.
- Maybe static / generated workflows reliably **underperform** dynamic agent reasoning → would challenge the design-emits-workflow candidate.
- Maybe "outer loop = context/independence/scale" **understates** a real *reasoning* benefit (best-of-N / search as genuine capability gain, not just variance reduction) → test it.

## Conventions
Output → `REPORT.md` + `sources.md` here, written by the **orchestrator (main session)** from the workflow's return (workflow persistence has been flaky 6×). Spot-check post-cutoff (> Jan 2026) citations before treating any as load-bearing; label verified-by-me vs from-the-run.
