---
id: ops-5
epic: ops
kind: item
status: done
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

---

## Completion synthesis (2026-07-22)

Executed Fable-side (prompt craft is the premium-model half of the split — no handoff). `.claude/skills/orient/SKILL.md` authored under the sk-agent-prompts discipline: goal-oriented identity, instruments-with-purpose rather than step sequences (the deterministic ritual lives in the CLI), the briefing as the deliverable contract, behavioural leans over hard directives. AGENTS.md gained the retrieval ordering — MAP → graph → `Read` → grep-last, with a graph miss named a layer bug to note — and the session-start pointer to the ritual.

**Gate: the self-referential smoke passed.** A cold general-purpose agent with zero session context, given only the skill file and the goal "continue the ops epic," produced a briefing that correctly reported this epic's own state: 4/6 done, **ops-5 itself in-flight** (correctly distinguishing the freshly built DB from the committed STATE and reading the lint drift error as the in-flight signature the skill describes), `adr-0006` awaiting sign-off, 18/32 platform items, backlog 6/9, bench with no baseline to compare — and closed with exactly the remaining work and the three files to read first. It also distrusted a stale environment snapshot in favour of live git. Two friction notes from the run were folded back into the skill before finalizing (the last-visit anchor when the heartbeat is HEAD; lint's non-zero exit being signal); the rest required no change.

**Eval-case candidates (for the bench; queued to the eval-metrics extension, not built here):** (1) judge-lane — a cold runner follows the skill; a sealed judge scores the briefing against `graph state --json` ground truth (epic counts, pending sign-offs, drift interpretation). (2) structured-lane — any lint error present at run time must appear in the briefing.

**v1 boundary noted:** `.claude/` is excluded from the parse (plan D5), so the orient skill is not itself a graph entity — the layer reaches it through AGENTS.md. Revisit only if repo-local skills multiply.
