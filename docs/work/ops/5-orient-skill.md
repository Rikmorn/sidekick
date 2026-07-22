---
id: ops-5
epic: ops
kind: item
status: open
deps: [ops-4]
implements: [adr-0007]
---

# ops-5 — Orient skill + retrieval ordering

**Goal.** `.claude/skills/orient/` — the session-start ritual that turns cold-start into one command, plus the full AGENTS.md retrieval-ordering directive. This is the adoption keystone: after this item, the layer is *used by default*.

**Spec.**
- **Skill flow:** run `graph build` (inline, fast) → `graph diff <last-visit-ref>` (default: last STATE.md commit) → read STATE.md + gaps + applies for anything the session's stated intent touches → emit the briefing: what changed since last visit, current state, open decisions/gaps, flagged regressions. Deterministic data from the CLI; the narration is the session model's job. Token-budgeted throughout.
- **AGENTS.md directive (the Decision 8 centerpiece):** MAP.md first → graph commands for status/coverage/applicability/history → Read for depth → grep only when the graph misses (and a graph miss on something it should know is a lint bug to note, not just a fallback).
- **Human hand-off:** the briefing ends with the dashboard link once ops-6 lands (stub note until then).
- Prompt authoring follows `sk-agent-prompts.md` discipline (goal-oriented identity, no step-machine; the deterministic sequence lives in the CLI, the skill reasons over its output).

**Gates.** Run it live in a fresh session against this repo; the briefing must correctly report this epic's own state (self-referential smoke — the layer describing itself). Eval-case candidates for the bench noted in the synthesis, not built here.
