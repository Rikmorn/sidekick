# Track B — Context & Memory

**Research question:** How should an autonomous agent manage context (working memory) and persistent memory so quality doesn't silently degrade and a wrong lesson doesn't poison future runs — and does surfacing meta-state (context budget, "I've done this before", uncertainty) actually change agent behavior?

**Method & integrity note:** deep-research workflow run `wf_e1baddf0-6d2`, 2026-06-06 (5 angles → 22 sources → 108 claims → 25 adversarially verified; 23 confirmed / 2 killed). **This report is RECONSTRUCTED by the orchestrator (Claude) from the run's verification log, because the workflow's synthesis agent had its file-write blocked and its detailed prose was NOT captured in the structured return** — the original F1–F10 write-up is lost. Tags below:
- **[spot-checked]** — I fetched the primary source and confirmed it's real and accurately represented.
- **[run-log]** — taken from the run's 3-vote verification; the *gist and vote are reliable*, but claim text was only available truncated and per-claim source attribution in the compressed return proved unreliable (two misattributions caught — see inline).

---

## Headline

Two strong results, one gap.

1. **Context degradation is real and survives frontier scale — and input *length alone* is a cause,** independent of retrieval quality and distractors. It's a gradual gradient, not a cliff. The popular "n²-attention" *mechanistic* explanation was **refuted** here, so don't assume bigger windows fix it.
2. **The awareness→use gap resolves sharply (your central question):** LLMs do **not** have accurate *self-reported* metacognition and are systematically **over-optimistic** about their own success, but a *useful internal confidence signal* exists that an **external harness** can read and act on. So the durable pattern is a **forcing function** — the harness extracts the signal and *triggers the action* (compact / hand off / escalate) — not "tell the model it's low on context and hope it self-regulates."
3. **Gap:** the local-CLI memory *substrate* question (markdown vs SQLite+FTS5/sqlite-vec vs vector DB) and the memory *taxonomy* were left under-covered. Your MySQL-vs-alternatives question is the one item this track did **not** resolve.

---

## Pillar 1 — Context degradation is real, and length itself is a cause

- **Input length ALONE degrades performance, even with perfect retrieval and zero distractors** — 13.9%–85% degradation across multiple LLMs on math/QA/coding; a gradual gradient, not a binary cliff. Verified mitigation: **recite the retrieved evidence before solving** (up to ~4% on RULER). **[spot-checked: arXiv:2510.05381, EMNLP 2025 Findings]** — *Misattribution caught:* the run log's "TAG tagging augmentation" mitigation is NOT from this paper; it belongs to another long-context-angle source and I did not individually verify it.
- **Lost-in-the-middle:** models use information at the beginning/end of context far better than the middle; long context is not processed uniformly. **[run-log, 3-0 · source arXiv:2307.03172, Liu et al. — recognized from training]**
- **Retrieval reliability depends on more than position** (semantic similarity, distractor load); distractors degrade performance non-linearly. **[run-log; distractor claim 2-1 · trychroma.com context-rot — recognized]**
- **The "context rot" *mechanism* (n²-attention + short-skewed training) was REFUTED (0-3).** The *effect* is real; the *causal story* is not established by the evidence found. Implication: do **not** bank on larger context windows or attention improvements to solve this. **[run-log refuted — verbatim below]**

## Pillar 2 — The awareness→use gap (the central question)

The sharpest result of the run. It both **confirms and corrects** your "context awareness is just a script" intuition.

- **LLMs do NOT have accurate self-reported metacognition.** The claim that a model can reliably estimate success beforehand (feeling-of-knowing) or judge its own correctness afterward (judgment-of-learning) was **REFUTED (0-3).** Models are also **systematically over-optimistic** about their own success and **poor at estimating remaining budget.** **[run-log: over-optimism & budget-estimation 3-0; accurate self-monitoring refuted 0-3]**
- **But a useful internal confidence signal exists,** and when an **external control harness** reads it and decides when to trust / retry / aggregate, pooled accuracy rose **48.3 → 56.9.** The paper's words: *"strong LLMs may already possess useful metacognitive ability, but require an explicit control harness to act on it"* and the harness *"turns [these signals] into an explicit control interface for reasoning."* **[spot-checked: arXiv:2605.14186]** — *Misattribution caught:* the run log's "activation steering of confidence is causal" sub-claim is NOT in 2605.14186; it comes from another metacognition-angle paper and I did not individually verify it.
- **Synthesis:** the signal is *useful* but not *accurately self-reported*, and the model won't reliably self-trigger on it. Therefore **surfacing meta-state to the model as text can even hurt; the robust design is a harness forcing function** — a script that extracts the signal/threshold AND triggers the action, rather than informing the model and hoping. Your "it's just a script" was right about *surfacing*; the correction is the script must also **force the action**, because the model is over-optimistic and can't self-monitor.

## Pillar 3 — Mitigations & memory governance (verified)

- **Compaction** — summarize a near-full context and reinitialize. **[run-log 3-0]**
- **Sub-agent context isolation as memory-partitioning** — the repo already does this. **[run-log 3-0]**
- **Programmatic tool calling** was the most consistent win; pair with **tool-result clearing** to reclaim context. **[run-log 3-0]**
- **Validate-before-persist** memory gate (carried from Track A; SSGM arXiv:2603.11768, spot-checked in Track A) — reinforced.

## The gap this run did NOT close

The run's own synthesis flagged: **local-CLI memory substrate and the memory taxonomy were left uncovered.** Substrate sources were *collected* (MemWeave: markdown + SQLite, no vector DB; Anthropic contextual retrieval; sqlite-vec hybrid search) and they *lean* toward "markdown + SQLite is enough for a single-user local tool; a vector DB is usually unnecessary" — but **no finding was verified**, so treat that as an unconfirmed lead, not a conclusion. This is the one open item for a focused follow-up.

---

## Action map (three buckets)

**IN-REPO** (skill/rule/hook/agent):
- Strategic compaction + a deliberate **handoff artifact** produced *before* quality degrades (not reactive at the wall).
- Sub-agent context isolation (already present) — keep using it as memory-partitioning.
- Evidence-recitation pattern for long-context tasks.
- **Validate-before-persist** gate on memory writes (shared with Track A).

**HARNESS/CONFIG** (Claude Code settings / hooks / MCP):
- A context-budget **forcing-function hook**: when a threshold trips, *trigger* compaction/handoff/escalation — don't merely surface the number to the model.
- Prefer **programmatic tool calling**; clear tool results from context once consumed.

**MODEL/PROVIDER-LEVEL** (track only):
- Over-optimism, poor remaining-budget estimation, and inaccurate self-monitoring are model traits — the *reason* the external harness is necessary. Track; don't assume they self-resolve.
- Long-context degradation as a capability ceiling (mechanism unproven; don't assume window size fixes it).

## Durability verdict

The **forcing-function-over-self-report** pattern is durable: it's a structural compensation for a model trait (over-optimism / weak self-monitoring) that won't shift quickly, and it leverages the reasoning engine while not *trusting* its introspection. Compaction and context-isolation are durable. The refuted n²-mechanism means "scale fixes context rot" is **not** a safe durability bet.

## Refuted (verbatim — 0-3)

1. *"Long-context degradation ('context rot') is real and mechanistic: as tokens increase, recall decreases. The cause is the transformer's n-squared pairwise attention plus training distributions skewed toward shorter sequences."* — 0-3 (effect real; **cause** not established). Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents.
2. *"LLMs possess accurate metacognitive self-monitoring signals: before solving they can estimate likelihood of success (feeling-of-knowing), and after solving judge whether the answer is correct (judgment-of-learning)."* — 0-3. Source: arXiv:2605.14186 angle.

## Open questions (from the run)

1. Forcing-function design for the Claude family's specific awareness→use gap.
2. The strategic handoff *trigger* — what signal fires a handoff *before* degradation, not after.
3. **Local-CLI memory substrate choice** (the unresolved substrate question).
4. Validate-before-persist combined with pruning/forgetting policy.

## Provenance & honesty

- **Spot-checked by me (real + accurately represented):** 2510.05381, 2605.14186; (from Track A) 2603.11768.
- **From run log, not independently re-checked:** 2307.03172 (recognized), trychroma context-rot (recognized), anthropic context-engineering (recognized), 2510.22956, 2602.07962, 2603.22161, 2606.00198, 2603.07670, 2502.06975, 2602.06052, 2602.19320, 2512.16962, 2605.18565, 2601.05504, plus blogs (MemWeave, atlan, sqlite-vec). Many carry 2026 IDs beyond my Jan-2026 cutoff.
- **Misattributions caught in the compressed return:** "TAG/tagging" mitigation ≠ 2510.05381; "activation steering" ≠ 2605.14186.
- **This is an orchestrator reconstruction** — the synthesis agent's original prose was lost to a blocked file-write. The verification *votes* are authoritative; exact claim wording for [run-log] items is approximate.
