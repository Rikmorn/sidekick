# Track D — Synthesis (A + B + C through the durability filter)

**What this is:** not a new research run — the durability filter you scoped, applied across Tracks A (verification), B (context & memory), and C (orchestration), distilled into "what do we actually change in the repo," sorted into three buckets. 2026-06-07.

**Inputs:** [`verification-autonomy/REPORT.md`](./verification-autonomy/REPORT.md) · [`context-memory/REPORT.md`](./context-memory/REPORT.md) · [`orchestration/REPORT.md`](./orchestration/REPORT.md).

---

## The through-line

All three tracks converge on one finding:

> **The model cannot be trusted to police itself.** Not its correctness (A: self-critique fails; self-consistent errors are invisible to it and don't shrink with scale). Not its confidence or resource-state (B: no accurate self-monitoring, systematically over-optimistic, bad at estimating its own remaining budget). Not its own coordination (C: agent-to-agent message-passing is a lossy channel; parallel writers make conflicting implicit decisions).

And every **durable** lever the research surfaced is the same shape: **an external structure that compensates for a specific self-blindness, while leaving the reasoning itself free.** Independent verification (A). Harness forcing-functions (B). Orchestrator-owned writes + single-threaded generation (C).

### Why this doesn't contradict the repo's founding principle — it completes it

The repo was born from one insight: *don't make agents behave like programs* (don't proceduralize the work; trust the reasoning engine). The research adds its complement: *don't trust the agent to regulate itself either.* Put together:

> **Proceduralize the META (oversight: verification, resource-governance, coordination). Liberate the OBJECT level (reasoning, problem-solving).**

The repo's original mistake-to-avoid was proceduralizing the object level (the agent-prompt rules fixed this). The *complementary* mistake is trusting the meta level to the model's introspection. Durable design refuses both: free reasoning, external oversight.

### The durability filter confirms it

The self-blindnesses are **slow-moving model traits that scale does not fix** — and the research gives disconfirming evidence against "stronger models will solve this":
- Self-consistent errors stay stable/increase with scale (A).
- The "context rot = n²-attention" mechanism was *refuted* — don't assume bigger windows fix degradation (B).
- The information-theoretic ceiling + compute-confound say a single strong agent is the baseline most multi-agent wins were *bought*, not architected (C).

So **external oversight scaffolding is durable** (worth building); **scaffolding that replaces reasoning is transient** (don't build). That's the filter, and it cleanly sorts every recommendation below.

---

## What the repo already gets right (vindicated — do NOT churn)

The reassuring headline: the architecture you "know works well enough" is where the evidence points.

- **Orchestrator-as-slash-command + tool-restricted read-only specialists + single-threaded writes** — C/F10 is direct primary-source vindication (Anthropic *and* Cognition converge here).
- **No self-validation / producer ≠ verifier / quorum** — A + C/F10 + sk-agent-prompts Rule 5.
- **Reason in prose, emit structure at the boundary** — C/F1–F2 vindicates Rule 7 verbatim.
- **Sub-agent context isolation as memory-partitioning** — B.
- **Constraints-not-procedures prompts** — the founding discipline; aligned with "liberate object-level reasoning."

The deltas below are mostly *sharpenings* plus a few genuinely new pieces.

---

## What to change — prioritized, three buckets

Priority = value × cheapness × (no new dependency).

### Tier 1 — high value, cheap, no new dependency → build

1. **Validate-before-persist memory gate** *(A + B · IN-REPO skill/hook)*. The highest-poisoning-risk action is a memory write; a wrong lesson persists and corrupts every future run. Before any lesson lands in `MEMORY.md`/persistent store, an *independent* pass validates it against source. Durable.
2. **Forcing-function over self-report** *(B · IN-REPO rule + HARNESS hook)*. Don't surface "you're at 70% context" and hope — a hook *triggers* compact/handoff/escalate at a threshold. Default-to-escalate when `irreversible ∧ low-confidence`. (The model is over-optimistic and can't self-monitor — surfacing alone can even hurt.) Durable.
3. **Orchestrator owns file writes** *(meta-finding + C · HARNESS/process rule)*. Subagents return data; the orchestrator writes deliverables. Directly fixes the flaky persistence we hit (3 runs, 3 outcomes). Durable.
4. **Research/problem-framing before solving, as a DEFAULT** *(the original complaint, now evidenced · IN-REPO rule/skill)*. Survey state-of-the-art + characterize the problem + state success criteria *before* proposing a solution. This whole exercise is the proof case. Durable — and it's the precondition for verification (you can't verify against criteria you never set).
5. **Independent (CoVe-style) verification in the quorum** *(A · IN-REPO)*. Verifiers answer verification questions *without seeing the draft's reasoning* — independence, not "re-read and check," is the mechanism. Sharpen verifier prompts/protocol. Durable.
6. **Make "no parallel writers" + "default single-agent, justify fan-out" explicit** *(C · IN-REPO rule)*. Mostly already true; state it, with the value/parallelism gate from F11. Durable.

### Tier 2 — high value, needs a decision/dependency

7. **Cross-family quorum** *(A · IN-REPO design + HARNESS model-routing)*. **The biggest substantive gap.** The repo's quorum is all-Claude = same-family, which A says is structurally compromised (self-preference bias) and capped (self-consistent errors correlate *within* a family). The fix is routing the *verify* step to a **different model family** — but that requires wiring in a non-Anthropic model (API/MCP): a real cost/complexity/dependency decision. **Recommendation:** adopt it specifically for the *verification* step on high-stakes/irreversible outputs; not everywhere. **Needs your call.**

### Tier 3 — defer / focused spike

8. **Memory substrate** *(B gap)*. markdown vs SQLite+FTS5/sqlite-vec vs vector DB. Leads *lean* "markdown + SQLite, no vector, for single-user local" but **unverified**. Resolve with a short focused follow-up or a design spike when we build the memory layer.
9. **Multi-agent dispatch thresholds** *(C/F11)*. The ~15× multiplier + value-bar logic is the rule; the exact numeric thresholds need calibration on real workloads. Tune later.

### MODEL/PROVIDER-LEVEL — track only, not ours to fix

- **Self-consistent errors** (don't shrink with scale) → why cross-family quorum *and* human escalation stay necessary.
- **Over-optimism / inaccurate self-monitoring / poor budget estimation** → why forcing-functions (not self-regulation) are the design.
- **Long-context degradation** (mechanism unproven) → don't bank on window growth.
- **Format tax** is an open-weight phenomenon → near-zero on Claude; the design rule (reason-then-structure) is free insurance, not a fix for a problem we have.
- **Real-time model coordination** ("not yet great" per Anthropic) → the breadth/write split is the hedge until it improves.

---

## The caveat that gates the strongest conclusions

C's single-agent / orchestration findings (F7–F9) are scoped to **text-only multi-hop reasoning** on a narrow model/dataset/budget set — the papers explicitly exclude tools, vision, and long-horizon agentic work. **That is exactly the harness's real target ("any domain", tool-heavy, long-horizon).** So "default to single agent" is a well-supported *prior*, **not a proven law for our domain.** Validating it on the actual workload is the #1 open question and the natural next research track.

---

## How this ladders back to the autonomy goal

Tying to where we started — autonomy as something the AI *derives per task* from the NFRs you express:

- **Verification independence (A)** is what makes a delegated decision *safe to not supervise*.
- **Forcing-functions (B)** are what keep quality from silently degrading mid-run without you watching.
- **Single-threaded writes + parallel verification (C)** is the safe arrangement for unsupervised action.
- **Human escalation is not a failure of autonomy** — A and B make it a *structural necessity* (self-consistent errors, over-optimism). The "tripwire on the irreversible" we started with isn't a limitation; it's the load-bearing safety primitive.

So the north star refines from "fully autonomous" to: **maximally autonomous, wrapped in an external oversight harness the model cannot talk its way out of** — because the research says the model's own judgment about whether it's right, confident, or coordinated is exactly the thing not to trust.

---

## Recommended next moves

1. **Build Tier 1** (6 items) — durable, cheap, no dependencies. Candidate first phase.
2. **Decide Tier 2** — do we add a non-Anthropic verifier for cross-family quorum on high-stakes outputs? (Yes/scoped/no.)
3. **Schedule the substrate spike** (Tier 3 #8) when the memory layer is on deck.
4. **Track E (future research):** does single-agent-under-matched-budget hold for tool-heavy/long-horizon "any-domain" tasks? — the gating caveat above.

---

## Provenance note

A, B, and the load-bearing post-cutoff papers across all tracks were spot-checked by me against primary sources (including C's *Format Tax* 2604.03616 and *Single-Agent vs MAS* 2604.02460, which I fetched and confirmed — C's report says they weren't re-fetched, but I did so in a later step). B is an orchestrator reconstruction (its synthesis write was lost). Self-reported figures (Anthropic 90.2%/15×) and 2-1 findings (DPI ceiling, memory-drift bound) are flagged in the source reports; treat as directional, not laws.
