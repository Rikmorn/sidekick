# Platform Landscape — Claude Code's shipped primitives

**Status:** Notes / observations (2026-06-07). **Not a decision and not a repositioning** — these are current-reality *inputs* for the eventual "how & what we implement" discussions (the per-item EPIC planning sessions). They may shift when those discussions happen.

**Why captured.** Prompted by a Boris Cherny interview ("I just write loops that prompt Claude"). Checking what that meant surfaced that Claude Code itself now ships much of the autonomy/loop machinery the north star described. Worth recording so the implementation discussions start from current reality rather than the early-2026 picture — not to pre-commit a direction.

## The observation: CC now ships the loop/orchestration cluster

Per a guide-agent verification pass against the installed CLI (**v2.1.168**) + current docs (`code.claude.com`, 2026-06). Granular version numbers are that pass's claims, **not** independently re-verified; several features are **research preview** and may change. The `Workflow` tool is confirmed first-hand — it's in the authoring session's toolset.

| Built-in | What it is | Loop topology |
|---|---|---|
| **`/goal <condition>`** | Goal-seeking loop: a **Haiku evaluator** checks the completion condition each turn and auto-continues until met. Live turns/tokens overlay; `/goal clear` to stop. (v2.1.139+) | gate-driven ("thermostat") |
| **`/loop`** | Rerun a prompt on a fixed interval, or let Claude pace it; customizable via `loop.md` | scheduled / recurring |
| **Dynamic Workflows** (the `Workflow` tool) | JS runtime that spawns/coordinates subagents via `pipeline()`/`parallel()`; the plan lives in the *script*, not Claude's context; backgrounded; ≤16 concurrent / 1000 total; results cached for resume. `/workflows` monitors runs. (research preview, v2.1.154+; `disableWorkflows` to off) | programmable fan-out + loop-until-gate |
| **`/effort ultracode`** | xhigh reasoning + **auto-orchestration** (Claude writes workflows for substantive tasks) | meta — chooses when to loop |
| **Agent view / background sessions / worktrees** | Dispatch + monitor parallel background agents; `--worktree` isolates file writes | parallel isolation |
| **Hooks** | Deterministic lifecycle gates (SessionStart, Pre/PostToolUse, Stop/SubagentStop); PostToolUse can `continueOnBlock` to feed rejection reasons back | the enforcement surface |

**Two loop topologies (framing from the discussion that surfaced this).** *Gate-driven* = iterate until a programmable gate (the "thermostat"; `/goal`, loop-until-dry). *Failure-driven* = retry-on-verification-failure (the "positive recursive loop"). The repo's `sk-build` nests both (outer: until `all_tasks_complete`; inner: bounded 1-retry on gate fail). `sk-goal-verify` is a *thermometer* — single-shot measure + propose a route — **not** a thermostat; the human closes that loop today.

## What it might mean — to weigh at implementation time (hypotheses, not decided)

The working hypothesis is that, with the loop substrate now in the platform, more of sidekick's durable value tilts toward the **oversight / verification / bounded-autonomy layer on top** rather than "a harness that loops." That is a hypothesis to confirm or revise in the planning sessions, **not** a committed reframe. Candidate implications per EPIC item:

- **E11 (cross-family quorum)** — `/goal`'s evaluator is a single, **same-family** (Haiku) judge closing the loop. That's the Track A risk (self-consistent errors ~60% correlated within a family, don't shrink with scale) now shipped into a primitive. `/goal` *does* get **producer ≠ verifier** right (separate invocation). Cross-family quorum reads as the natural upgrade — to weigh when E11 is planned.
- **E15 (eval layer)** — a `/goal` completion-condition (and any loop-exit gate) is essentially an eval rubric. Writing *checkable* conditions is the skill; Code/LLM-judge/Human rubric tiering would harden a fallible judge against gaming / false-satisfaction.
- **E10 (operator-dial)** — the budget/turn ceiling + blast-radius/reversibility governor that `/goal` and `ultracode` leave to manual circuit-breaking (`/goal clear`). **Hooks** look like the deterministic enforcement surface for "irreversible → escalate."
- **E4/E5/E14 (orchestration rules)** — the dynamic-Workflows runtime already encodes several of our findings (plan-in-script-variables ≈ orchestrator-owns-writes; worktree isolation for parallel writes; a hard concurrency cap). The open question shifts toward "what do our rules add *on top of* the runtime," not "build the runtime."

**Bigger open question for the how/what discussion:** how much of sidekick's intended value is now provided by the platform, and what is genuinely ours to add? This depends on assumptions that aren't settled — whether these primitives persist (several are research-preview), and whether the platform itself grows the oversight layer next (cross-family judging, blast-radius governance, eval-as-exit-gate). **Open — to discuss, not decided.**

## Convergent-evolution note

The `Workflow` runtime independently encodes several sidekick findings: **plan-in-script-variables-not-context** (≈ orchestrator-owns-writes + context isolation), **worktree isolation for parallel writers** (≈ the no-parallel-writers concern), and a hard **concurrency cap**. Another convergent-evolution data point alongside superpowers/gsd ([`prior-art.md`](./prior-art.md)) — the orchestration substrate arrived at the same principles the research did.

## Links
[`README.md`](./README.md) (problem-space map) · [`../EPIC.md`](../EPIC.md) (E10/E11/E15 weigh these) · [`prior-art.md`](./prior-art.md) · [`../adr/0001-harness-shape.md`](../adr/0001-harness-shape.md) (the platform shift *strengthens* 0001's direction — the lifecycle skeleton's remaining justification leans more on oversight-legibility than mechanism; relevant when 0001 is revisited, not a change to it).
