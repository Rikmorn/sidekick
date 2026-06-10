# Platform Coupling — Research Framing

**Status:** Pre-research framing (2026-06-10). Captures the E2 discussion state + open questions + disconfirming angles, *before* the deep-research sweep. Relationship: operationalizes the open question left by [`../platform-landscape.md`](../platform-landscape.md) ("whose loop?") that [`../agentic-loops/REPORT.md`](../agentic-loops/REPORT.md) explicitly does not answer — that track settled *when a loop pays*; this one settles *whether to rent the loop substrate*.

## Why this research

E2 (platform-primitives scoping decision) gates E4/E5/E13/E17/E18. The existing research argues "build the oversight harness; rent the wording" but never examined the build-vs-buy question for the orchestration substrate itself — coupling risk, churn precedents, ecosystem adoption, fallback posture. The landscape doc was a single unverified pass; a 2026-06-10 doc-verification run updated it materially (see below).

## Verified platform facts this framing assumes (2026-06-10, guide-agent pass against code.claude.com docs)

- **Workflows are stable** (GA May 2026, min CC v2.1.154) — *not* research preview as the landscape doc recorded. `ultracode` remains experimental.
- **No mid-run user interaction** in workflows (no AskUserQuestion; only permission prompts pause). Pattern: run → return → talk to user → `resumeFromRunId`.
- **Resume caching is same-session only** — cross-session resume/recovery stays hand-rolled regardless of substrate.
- **Workflow scripts have no shell/file access** — gates inside a workflow run via spawned agents (claims), unless enforced below the substrate.
- **Hooks fire inside workflow-spawned agents** (PreToolUse can block + feed reason; Stop can force continuation) — a deterministic enforcement surface under *both* substrates.
- Workflow agents can use custom `agentType` from `agents/` — sk-executor / sk-spec-reviewer reusable as-is.
- `/goal`'s evaluator is Haiku, fixed, conversation-surface-only — not a gate substrate candidate.
- `disableWorkflows` exists at user/project/org level with **no documented graceful fallback**; plugins can declare CC `minVersion` but no "requires Workflows" flag.

## What we currently believe (to confirm / challenge / enrich)

1. The durable-value hypothesis: with the loop substrate in the platform, sidekick's value tilts to the **oversight layer** (gates, verification, dial, escalation, resume/recovery) on top.
2. What the platform structurally does NOT provide maps ~1:1 onto sidekick's research-derived value claims (mid-run human routing, cross-session resume, deterministic in-orchestrator gates, sound completion evaluation, fallback).
3. The likely shape is **hybrid**: deterministic CLI kernel (wave-plan/check-drift-style helpers — and more where justified) + hand-rolled interactive write-path loop + platform Workflow for breadth-only read fan-out.
4. sk-build's write path gains little from Workflows (writes are deliberately sequential per no-parallel-writers); the runtime's wins land on verification/research fan-out.
5. Where coupling risk can't be engineered away (e.g. `disableWorkflows` with no fallback), **documenting the limit + operator guidance is itself a deliverable** — consumers make informed decisions or follow the minimisation guidance (operator, 2026-06-10).

## Core question

Should sidekick's orchestration loops be built ON Claude Code's platform primitives, kept hand-rolled in slash-command skills, or split per workload — and what coupling posture (minVersion, fallback, absorption instrumentation) minimizes regret across platform churn?

## Angles (the sweep)

- **A1** Historical absorption/churn precedents: OpenAI Assistants API deprecation, ChatGPT plugins→GPTs, LangChain abstraction churn, agent-framework rewrites — outcomes for early-couplers vs hedgers.
- **A2** Claude Code ecosystem adoption of dynamic Workflows since GA — orchestrate-in-skill vs orchestrate-in-workflow patterns, migration stories, pain points.
- **A3** Practitioner guidance on vendor/platform coupling for dev tooling — accept coupling vs abstraction layer vs fallback; graceful degradation when a feature is disabled/absent.
- **A4** Hybrid architectures: deterministic code kernel + rented runtime for fan-out — evidence either way.

## Disconfirming angles to plant

- Maybe **early coupling wins** historically — hedgers paid an abstraction tax for churn that never bit, and the platform absorbed their layer anyway.
- Maybe the hand-rolled loop *is* the absorbed thing — keeping it is the durability-filter failure mode (clinging to scaffolding the platform now provides better).
- Maybe ecosystem adoption signal is too young (one month post-GA) to carry any weight — in which case say so rather than overfitting to anecdotes.

## Conventions

Output → `REPORT.md` + `sources.md` here, written by the **orchestrator (main session)** from the workflow's return. Spot-check post-cutoff (> Jan 2026) citations before treating any as load-bearing; label verified-by-me vs from-the-run.
