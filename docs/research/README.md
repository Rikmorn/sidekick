# Sidekick Research — Index & Problem-Space Map

**What this is.** Sidekick is moving from a dev-focused skills/rules/agents/hooks/tools harness toward a project that (a) tracks the state of the art in AI-as-assistant and (b) distils it into capability for work in *any* domain. This folder is the research record **and** the live map of what's still open. (It's itself an instance of the observability finding below: a navigability layer over a token-level corpus, so the body of work doesn't require "trudging through markdown" to use.)

**North star.** *Maximally autonomous, wrapped in an external oversight harness the model can't talk its way out of* — and **adaptive**: the harness shrinks as models self-police better, and the durability filter predicts the order (fast-moving capability artifacts loosen first; slow-moving self-blindnesses keep their guardrails longest). Autonomy is **derived per task** from the non-functional requirements the user expresses (scope of delegation, urgency, blast-radius/reversibility); irreversible actions escalate for approval.

**The through-line (across all tracks).** The model cannot be trusted to police **itself** — not its correctness (Track A), not its confidence/resource-state (Track B), not its own coordination (Track C). Every durable lever found is external structure that compensates for a specific self-blindness while leaving the reasoning itself free. This *completes* the repo's founding principle:

> **Proceduralize the META (verification, resource-governance, coordination). Liberate the OBJECT level (reasoning).**

**Durability filter (applied to every finding).** *Durable* = leverages the reasoning engine, or external-oversight structure compensating for a slow-moving self-blindness scale won't fix. *At-risk* = hand-built programs that substitute for reasoning (absorption candidates as models improve). Findings are bucketed **IN-REPO / HARNESS-CONFIG / MODEL-PROVIDER (track-only)**.

---

## Completed research

| Track | Question | One-line finding | Doc | Confidence |
|---|---|---|---|---|
| **A — Verification & autonomy** | manufacture verifiers; stop self-reinforcing loops | **independence > verification**; cross-family quorum, *capped* by self-consistent errors; validate-before-persist | [`verification-autonomy/REPORT.md`](./verification-autonomy/REPORT.md) | high |
| **B — Context & memory** | manage context; does surfacing meta-state change behavior | **forcing-function > self-report** (model can't self-monitor, is over-optimistic); length alone degrades. ⚠️ *degraded run — orchestrator-reconstructed; substrate-anchored, superseded on that angle by Memory below* | [`context-memory/REPORT.md`](./context-memory/REPORT.md) | mixed |
| **C — Orchestration & comms** | multi-agent vs single; JSON vs prose | **multi-agent for breadth/verification, single-threaded writes**; format-tax enters at the prompt (≈0 on Claude); reason-then-structure | [`orchestration/REPORT.md`](./orchestration/REPORT.md) | high |
| **D — Synthesis** | what to change in the repo | the through-line above; **repo architecture vindicated**; Tier-1 deltas | [`SYNTHESIS.md`](./SYNTHESIS.md) | — |
| **Memory (first-principles)** | what is memory, from requirements | **episodic is the gap**; observability = property of *form* (token-level + a navigability layer); agent memory is unsolved/failing; **no tool pick** | [`memory/REPORT.md`](./memory/REPORT.md) | high |
| **Reasoning & Capability** | why AI doesn't default to the meta-process; the dial | **calibration + initiative problem, not a reasoning deficit**; defaulting gap is RLHF-amplified (structural); the dial is **bidirectional** (overthinking flips correct→wrong); operator-dial has precedent (bounded adaptive thinking) | [`reasoning-capability/REPORT.md`](./reasoning-capability/REPORT.md) (+ `FRAMING.md`) | high |
| **Prompting** | declarative/guardrail vs imperative; evaluate sk-agent-prompts.md | thesis **vindicated**, surface form **refined** (positive guardrails > prohibitions); surprise: **reasoning degrades constraint-following**; wording-tuning being absorbed, constraint-design durable | [`prompting/REPORT.md`](./prompting/REPORT.md) (+ `FRAMING.md`) | high |
| **Agentic loops** | when an outer loop beats a single agentic invocation; gates; design-as-workflow | **outer loop = context/independence/scale device, not reasoning**; the gate must be *independent + sound* (self-verification is net-negative); **gen-verification gap WIDENS with scale** (durability tailwind); compiled workflows **overfit** → keep the OBJECT dynamic; iteration is **non-monotonic** → cap it; **sizing-detection is the binding weak spot** | [`agentic-loops/REPORT.md`](./agentic-loops/REPORT.md) (+ `FRAMING.md`) | high (spot-checked) |

**Execution tracker → [`../EPIC.md`](../EPIC.md)** — the work breakdown (Tier 1/2/3 as items E1–E13 + the role-grouped toolchain audit), each item a future planning session. Rationale behind the tiers → **[`ACTION-PLAN.md`](./ACTION-PLAN.md)** (consolidated across all six research areas; supersedes the A/B/C-only action-map in `SYNTHESIS.md`).

**Prior art → [`prior-art.md`](./prior-art.md)** — superpowers & gsd vs our findings. Convergent evolution validates the research; **gsd is ahead on memory + eval** (our two blind spots) — study before building E10/E14/E15/E13. Shared industry-wide gap: cross-family verification.

**Design principles → [`../DESIGN-PRINCIPLES.md`](../DESIGN-PRINCIPLES.md)** — the durable decision-rule doctrine (proceduralize-meta/liberate-object; structure≠rigidity; build-the-harness/rent-the-wording; **context-management-as-architecture-driver**; etc.).

**Decisions → [`../adr/`](../adr/README.md)** — architecture decision records (with the assumptions each rests on). ADR-0001: harness shape (behavioural-leaning, lifecycle-as-thin-skeleton, eval-gated). Tier 1 = apply sk-agent-prompts edits + rules + small builds; Tier 2 = navigability layer / operator-dial / cross-family quorum; Tier 3 = episodic memory, substrate, MAS thresholds.

---

## Live problem-space map (open threads — for continued exploration)

Each: *why it matters · status.*

**No active research run.** (Operator-opened threads — Reasoning & Capability, Prompting, and **Agentic loops** — are complete; see table.)

**Top new tracks surfaced by the Agentic-loops research (highest value first):**
- **Externalize the sizing/routing signal** — self-reported confidence is broken (agents predict ~73% success vs ~35% true), yet the whole "when to loop / how big a leaf" decision rides on it. Pick empirically among: conformal-over-N (KnowNo), a separate monitor agent, trace-length/variance proxies, escalate-to-human. *The single highest-value follow-up.*
- **The fuzzy-goal gate gap** — every positive flow-engineering result presupposes a crisp executable oracle (tests). Is there *any* sound gate short of a human for "make this codebase better," or does decompose-to-crisp-leaves always bottom out in "ask the human" for taste/integration judgments?
- **Instrument sidekick's own gates for absorption/inversion** — scaffolds flip net-positive→net-negative *silently* across one model generation (the "Prompting Inversion": a GPT-4o win becomes a GPT-5 tax). Detect when a structural element crosses zero rather than assuming durability.
- **Outer-retry-budget vs correctness** — all the non-monotonic data is *inner* thinking-tokens; no clean study of *outer* retry budget exists. What's the optimal outer iteration cap per task-type?

**Ready to apply:** [`../backlog/sk-agent-prompts-revisions.md`](../backlog/sk-agent-prompts-revisions.md) — surgical edits to `.claude/rules/sk-agent-prompts.md` from the prompting research (positive guardrails, ">10" as a smell, few-shot model-dependence, "reasoning is not a constraint-guarantee", directive priority).

**Emerging requirement:** operator-dial tooling — let a human set knobs (research depth, autonomy, risk, budget) *before* the AI tackles a task. [`../backlog/operator-dial-tooling.md`](../backlog/operator-dial-tooling.md).

**Platform landscape (2026-06-07, notes — not a decision):** Claude Code now ships the loop/orchestration primitives the north star described (`/goal`, `/loop`, dynamic Workflows, `/effort ultracode`, agent-view, hooks). Observations + candidate per-item implications (E11/E12/E13) recorded in [`platform-landscape.md`](./platform-landscape.md) as inputs for the implementation discussions — *not* a committed reframe; they may shift. (Note: several primitives are research-preview; spot-check before treating versions as load-bearing.)

**Surfaced by the research so far:**
- **Track E — does "single-agent wins" hold on the REAL domain?** C's result is text-only multi-hop reasoning; the harness targets tool-heavy, long-horizon work. "Default to single agent" is a *prior*, not a law for us. · **open — candidate research track.**
- **`CLAUDE.md`/`AGENTS.md` mechanics** — when persistent-instruction files are actually *consulted* vs *ignored*. Directly the placement dilemma (P4); **no verified source exists** — surprisingly unstudied. · **open — candidate track.**
- **Navigability/observability layer over markdown** — what "see what it knows without trudging md" concretely needs (generated index? query? graph view?). Most tractable + highest daily value; doesn't depend on the unsolved frontier. · **open — candidate *first build*.**
- **Which relationship representation wins** (A-MEM links vs Zep temporal-KG vs markdown+index) — no head-to-head; "causally-grounded retrieval" is a named open frontier (may be genuinely unsettled). · **open.**
- **Forgetting policy without amnesia** — the hoarding↔amnesia dilemma is named but unsolved; what triggers eviction for a single-user assistant? · **open.**
- **Memory substrate** (markdown vs SQLite+FTS5/sqlite-vec vs vector/graph) — deliberately deferred; it is *downstream* of the requirements above. Don't pick a store until they're settled. · **deferred (do not pre-decide).**

- **CoT faithfulness of the decision trace** — is "why A not B" the real reason or post-hoc rationalization? The Reasoning & Capability run did *not* resolve it; it's the trap for hands-off auditability (a confident-but-unfaithful trace is worse than none). · **open — candidate dedicated run.**
- **Capability self-knowledge & escalation** — does the model know its own tool/capability boundaries (the shoes/house escalation)? Unresolved; likely needs a structural capability-registry, not model self-report. · **open.**

**From the original topic list, not yet researched:**
- Tool & environment design (incl. MCP) — agents are bounded by their affordances; "any domain" needs the tools to exist.
- Calibration & escalation — uncertainty estimation; knowing when to stop/escalate.
- Safety / permissions / reversibility / sandboxing — blast-radius control for autonomous action.
- Planning & reasoning methods — ReAct/Reflexion/ToT, test-time compute, reasoning models absorbing scaffolding.
- Observability / tracing / replay of agent runs.
- Self-extension / capability-gap awareness (downstream of episodic memory).

---

## Backlog (parked *build* decisions)
- [`../backlog/cross-family-quorum.md`](../backlog/cross-family-quorum.md) — route verification to a non-Anthropic model family (needs a dependency decision).

## Conventions
- Research outputs → `docs/research/{topic}/REPORT.md` + a sources file. Parked build items → `docs/backlog/{item}`.
- **Orchestrator owns file writes** — the deep-research workflow's persistence proved flaky (across runs: never-wrote / wrote-via-bash-override / write-blocked-and-lost). Verify on completion; reconstruct from the run log if needed.
- **Spot-check post-cutoff (> Jan 2026) citations** by fetching them before treating any as load-bearing. Distinguish "verified by me" from "from the run's adversarial verification."
