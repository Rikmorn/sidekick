# Track C — Agent Communication & Orchestration

**Research question:** When does multi-agent orchestration actually beat a single strong agent, and should agents communicate in natural language rather than forced structured output (JSON)?

**Method:** deep-research workflow (search angles → claims → 23 adversarially verified by 3-vote quorum → 20 confirmed, semantic dups merged → 11 synthesized findings). 2026-06-06.

**Builds on:** Track A (`../verification-autonomy/REPORT.md`) — cross-FAMILY quorum (not same-model), and the self-consistent-error ceiling that caps even cross-model agreement (~60% shared errors under shared architecture/provider).

**Companion file:** [`sources.md`](./sources.md).

---

## Headline

Two answers, both with strong primary support.

**(1) On format:** Don't force agents to reason *inside* a rigid output schema. Decoupling reasoning from formatting — reason in free-form natural language first, then emit structure in a second pass (or within extended thinking) — recovers nearly all the accuracy that schema-constrained decoding loses. The "format tax" enters mostly **at the prompt** (the instruction "answer in JSON"), before any decoder/grammar constraint applies. Structured output is **load-bearing only at boundaries another program parses** (aggregation, voting, tool-call dispatch); everywhere else it is reasoning-degrading noise. Critical scope caveat: the heaviest format tax is measured on **open-weight** models; recent **closed-weight frontier models (incl. Claude) show little to no format tax** — so for this harness the cost is smaller than the headline, but the *design rule* (reason free-form, structure at the boundary) is still the safe default and costs nothing.

**(2) On orchestration:** Multi-agent does **not** reliably beat a single strong agent. Under **matched thinking-token budgets**, single agents consistently match or outperform multi-agent systems on multi-hop reasoning across three model families; an information-theoretic argument (Data Processing Inequality) says a single agent with full context can't be *beaten* by agents reasoning over passed messages, under fixed budget + perfect context use — forced message-passing is a lossy channel, not an information gain. Real MAS fail 41–86.7% of the time on hard benchmarks, and the canonical pro-MAS result (Anthropic's research system, +90.2%) came at **~15× the token cost**, with token spend alone explaining ~80% of the variance — i.e. the win was mostly *buying more compute*, not architecture.

**The defensible synthesis** — and it converges with both Anthropic's and Cognition's *current* practitioner positions — is: **multi-agent for breadth (parallel, independent, read-only/analysis work) and for verification; single-threaded for writes/generation.** Multi-agent helps when (a) the task genuinely parallelizes over independent directions, (b) information exceeds one context window, (c) the single agent's context is degraded enough that decomposition/filtering pays, or (d) you're spending the extra tokens deliberately for a high-value task. Parallel agents that take *write* actions make conflicting implicit decisions and produce incoherent output — the core MAS failure mode.

---

## Confirmed findings

Each: confidence · sources · **bucket** · *durability*.

### Format: structured output vs natural language between agents

**F1. The format tax is real and originates at the prompt, not the decoder.** Requiring structured output (JSON/XML/LaTeX/Markdown) substantially degrades reasoning and writing on open-weight models; the dominant cost enters the moment you *instruct* the model to produce a format — proven by ablation (prompt-only degradation −3.9pp avg; constrained decoding adds only −1.6pp; 92% of significant effects appear in prompt-only conditions). — **high** · *The Format Tax* (arXiv:2604.03616) + *Let Me Speak Freely?* (arXiv:2408.02442, EMNLP 2024) · **IN-REPO** (don't wrap reasoning in a schema) **+ HARNESS/CONFIG** (avoid grammar-constrained decoding for reasoning steps) · *durable design principle; the magnitude is partly a model-capability artifact (see F3).*

**F2. Decouple reasoning from formatting — it recovers nearly all the loss.** Reason free-form first then reformat in a second pass, OR enable extended thinking within one generation; either "substantially recovers lost accuracy" and NL-to-Format matches unrestricted natural-language performance across most models. This is the single most actionable format finding. — **high** (two primary sources, both 3-0) · arXiv:2604.03616 + arXiv:2408.02442 · **IN-REPO** (specialist contract: reason in prose, emit one JSON object at the boundary — *already exactly sk-agent-prompts.md Rule 7*) · *durable; leverages the reasoning engine rather than substituting a program.*

**F3. The format tax is task-dependent AND model-dependent.** Stringent formats hurt reasoning-intensive tasks but can *improve* accuracy on classification tasks by constraining the answer space. Separately: the tax is heaviest on open-weight models — recent closed-weight frontier models (incl. Claude) show little-to-no tax. *(Note: the stronger sub-claim "the tax is purely an open-weight capability gap / universal-property" was a borderline framing and was killed 1-2 in verification — what survives is the measured observation that closed models show little tax, not a clean theory of why.)* — **high** (task-dependence, 3-0) / **medium** (model-dependence; one source, and the strong version was refuted) · arXiv:2408.02442 + arXiv:2604.03616 · **IN-REPO** (structure is fine — even helpful — for classification/voting outputs; avoid it for reasoning) **+ MODEL/PROVIDER** (closed-model tax may stay near-zero — track) · *the classification benefit is durable; the closed-model immunity is a capability artifact to track, not bank on for open models.*

### Orchestration: single strong agent vs multi-agent systems

**F4. Multi-agent systems frequently don't beat a single agent, and fail a lot in absolute terms.** Headline MAS gains on popular benchmarks are "often minimal"; across 7 SOTA open-source MAS, observed failure rates ran **41% to 86.7%**. — **high** · *Why Do Multi-Agent LLM Systems Fail?* / MAST (arXiv:2503.13657, NeurIPS 2025; OpenReview MqBzKkb8eK) · **IN-REPO** (default to single-agent; justify MAS per-task) · *durable empirical baseline; failure rates will fall as models improve, but the "not a free win" conclusion holds.*

**F5. MAS failures decompose into 3 categories / 14 modes — orchestration, agent-to-agent communication, verification.** Specification/System-Design Issues (41.8%), Inter-Agent Misalignment (36.9%), Task Verification (21.3%); grounded-theory taxonomy from 150 traces (Cohen's κ=0.88) applied to ~1242 traces. These map directly onto the three loci you must get right: orchestrator design, handoff/communication, and the verification step. — **high** · MAST (arXiv:2503.13657 / MqBzKkb8eK) · **IN-REPO** (design the orchestrator against these named failure modes; Inter-Agent Misalignment ≈ 37% of failures argues for minimal, lossless handoff) · *durable diagnostic frame.*

**F6. MAS failures are architectural, not fixable by trivial tweaks.** Tactical fixes (better prompts, topology redesign, conversation management) yielded measurable-but-insufficient gains (e.g. ChatDev +14%, still "insufficiently low for real-world deployment"); the headroom is in better MAS *design*, not prompt-patching. — **high** · MAST (arXiv:2503.13657) · **IN-REPO** (don't expect prompt-tuning to rescue a bad multi-agent topology — redesign; echoes sk-agent-prompts.md "escalate to structural enforcement") · *durable.*

**F7. Under matched thinking-token budgets, single agents match or beat MAS on multi-hop reasoning; most reported MAS wins are confounded by extra compute/context.** Across Qwen3-30B, DeepSeek-R1-Distill-Llama-70B, Gemini 2.5, SAS won or tied in nearly every budget-matched condition. — **high** · *Single-Agent LLMs Outperform MAS Under Equal Thinking Token Budgets* (arXiv:2604.02460, Tran & Kiela) · **IN-REPO** (when comparing single vs multi, normalize compute before believing a MAS win) · *durable methodological correction; scoped to text-only multi-hop reasoning (tools/vision/safety out of scope per the paper).*

**F8. Information-theoretic ceiling on forced message-passing.** Because inter-agent messages M are a function of full context C (Markov chain Y–C–M), the Data Processing Inequality guarantees a single agent with full access to C performs at least as well as a MAS reasoning over M=g(C) — *under fixed budget and perfect context utilization*. Forced agent-to-agent message-passing is a lossy channel, not an information gain. — **medium** (single source; vote 2-1 — the bare "ceiling" framing reads as absolute, but the claim's own preconditions restore the paper's conditionality) · arXiv:2604.02460 · **IN-REPO** (don't fragment context across workers unless you're buying something the single context can't deliver — parallelism, context-window overflow, or filtering) · *durable as a conditioned theorem; the conditions (perfect context use) are exactly where it breaks — see F9.*

**F9. The boundary where decomposition pays: when the single agent's context is corrupted, not merely long.** MAS becomes competitive/superior only once a single reasoning trajectory can't distinguish relevant from misleading info: Sequential MAS beats SAS at heavy corruption (α=0.7) on MuSiQue, SAS leads at mild (α=0.3); the crossover holds under both masking and substitution noise. Longer context alone does NOT flip it — *corruption/noise* does. — **high** (3-0) but **medium generalizability** (one model, one dataset, one token budget) · arXiv:2604.02460 · **IN-REPO** (route to decomposition when inputs are noisy/adversarial/low-signal-density, not just large) · *durable mechanism, narrow empirical base.*

**F10. The legitimate multi-agent wins: breadth-first read-only work, and analysis/verification — with single-threaded writes.** (a) Anthropic's MAS (Opus 4 lead + Sonnet 4 subagents) beat single-agent Opus 4 by **90.2%** on internal research eval — but only for breadth-first queries pursuing independent directions, and it's a self-reported result with undisclosed N. (b) Cognition's *current* position (a refinement, not reversal, of "Don't Build Multi-Agents"): MAS works best when **writes stay single-threaded** and extra agents contribute *intelligence* (analysis/review) rather than conflicting *actions*; read-only subagents "mostly resemble tool calls rather than true multi-agent collaboration." (c) Parallel agents that take write actions make conflicting implicit choices about style/edge-cases/patterns → incoherent combined output (the core generation failure mode). This is the **"multi-agent for verification/breadth, single-agent for generation"** split — and it is defensible because the two leading practitioners on opposite sides *converge* on it. — **high** (3 primary sources, mutually corroborating; opposing sources reinforce rather than refute) · Anthropic multi-agent research system + Cognition `dont-build-multi-agents` + `multi-agents-working` · **IN-REPO** (parallel read-only/analysis specialists + single-threaded writer/orchestrator — *this is already the sk-* design: orchestrator-in-slash-command, tool-restricted specialists, no self-validation*) · *durable architectural pattern; vindicates Track A's cross-family verification quorum and sk-agent-prompts.md Rule 5.*

### Economics

**F11. Multi-agent is ~15× the token cost of chat (agents ~4×), and the gains are largely *bought*, not architected.** Token usage alone explained ~80% of performance variance on BrowseComp; Anthropic states MAS "work mainly because they help spend enough tokens." Therefore MAS is worth it only for **high-value tasks with heavy parallelization, info exceeding a single context window, and many complex tools**; tasks needing shared context or heavy inter-agent dependencies (most coding) are a poor fit. — **high** (3-0; figures self-reported by Anthropic but internally self-critical and reproduced by multiple secondaries) · Anthropic multi-agent research system + arXiv:2604.02460 (compute-confound) · **HARNESS/CONFIG** (gate MAS dispatch on task value/parallelism; budget the ~15× multiplier explicitly) **+ IN-REPO** (orchestrator reasons about whether the task clears the bar before fanning out) · *durable economic gate; the multiplier shifts with pricing but the value-threshold logic is durable.*

---

## Refuted (killed by the adversarial pass — useful negatives)

- **"Format restriction caused a ~27-pt GSM8K drop (75.99%→49.25% under JSON-schema)"** — 1-2. The specific magnitude/numbers didn't survive; the *directional* finding (format hurts reasoning) did (F1). arXiv:2408.02442.
- **"The gap is NOT from parsing errors but from the reasoning process itself (LLaMA-3-8B: 0.148% parse errors yet 38.15% gap)"** — 1-2. Specific figures killed; the prompt-level-origin finding survives via the *Format Tax* ablation (F1). arXiv:2408.02442.
- **"The format tax is purely an open-weight capability gap / not inherent to structured generation (universal-property)"** — 1-2. The clean theory was over-strong; what survives is the weaker measured observation that closed models show little tax (F3). arXiv:2604.03616.
- **"Multi-agent is fragile because context can't be shared thoroughly enough between agents"** — 0-3. The *mechanism* (conflicting implicit decisions) survives via F10; this particular phrasing of the cause was rejected. cognition.ai/dont-build-multi-agents.
- **"Reliable agent systems must share FULL agent traces, not just messages/the task"** — 0-3. The prescriptive "must share full traces" did not survive; F5/F10 (minimize misalignment, single-threaded writes) carry the actionable substance. cognition.ai/dont-build-multi-agents.

---

## Consolidated action map (three buckets)

**IN-REPO** (skill/rule/hook/agent):

- **Specialist contract = reason in prose, emit one JSON object at the boundary** (F1, F2). This is *already* sk-agent-prompts.md Rule 7 — this research is direct primary-source vindication. Keep reasoning out of the schema; the orchestrator reads prose and parses only the final fence.
- **Structure is fine for classification/voting/aggregation outputs; avoid it for reasoning steps** (F3). Don't schema-wrap a step whose job is to think.
- **Default to single-agent; justify multi-agent per task** (F4, F7). Add a rule: before fanning out, the orchestrator reasons (in prose) about whether the task clears the bar — genuine parallelism over independent directions, context-window overflow, noisy/low-signal inputs, or deliberate high-value compute spend.
- **Parallel = read-only/analysis; writes = single-threaded** (F10). The sk-* shape (orchestrator-in-slash-command + tool-restricted specialists + "no self-validation" Rule 5) already encodes this. Make "no parallel writers" an explicit constraint.
- **Design orchestrators against the 14 MAST failure modes** (F5, F6) — especially Inter-Agent Misalignment (~37%): minimize and de-lose handoff context; don't expect prompt-tuning to rescue a bad topology — redesign (matches the repo's "escalate to structural enforcement").
- **Route to decomposition on corrupted/noisy/adversarial inputs, not merely large ones** (F9).
- **Multi-agent for verification stays the legitimate use** (F10 + Track A): cross-family quorum, debate, adversarial review are analysis (intelligence), not conflicting writes — exactly the safe class.

**HARNESS/CONFIG** (Claude Code settings / hooks / MCP / model routing):

- **Avoid grammar-/schema-constrained decoding on reasoning steps** (F1). If a tool needs JSON, prefer reason-then-format over constrained decoding mid-reasoning.
- **Gate multi-agent dispatch on task value and parallelism; budget the ~15× token multiplier explicitly** (F11). Cheap single-agent first; fan out only when the task clears the value/parallelism bar.
- **Normalize compute before trusting any "MAS beat single-agent" comparison** (F7) — a MAS that "won" at 4–15× tokens may lose at matched budget.

**MODEL/PROVIDER-LEVEL** (track only):

- Closed-weight frontier models' near-zero format tax (F3) — may persist or shift; don't bank on it for open models.
- Models' real-time coordination/delegation ability (Anthropic: "not yet great") — improves with capability; the breadth-vs-write split is the durable hedge until then.

---

## Durability verdict

The **durable** designs leverage the reasoning engine via *structural arrangement of independent reasoners and clean boundaries*: reason-free-form-then-format (F2), single-threaded writes + parallel read-only analysis (F10), compute-normalized comparison (F7), value-gated fan-out (F11), and the DPI-grounded "don't fragment context without buying something" heuristic (F8). None is a hand-built program a stronger model obviates — they're about *how you arrange the agents and what you let them write*, which survives model upgrades.

The **track-only / capability-artifact** items: the *magnitude* of the format tax (F1/F3 — shrinks as models improve, already near-zero on closed frontier models) and models' real-time coordination skill. These will move with scale. But the *direction* of the orchestration findings is disconfirming for "stronger models will make naive multi-agent win": the information-theoretic ceiling (F8) and the compute-confound (F7, F11) say a single strong agent with full context is the baseline to beat, and most MAS wins to date were *bought with tokens*, not architected.

**Net:** "Multi-agent for verification/breadth, single-agent for generation" is defensible — not as a fashion, but because (a) two leading practitioners on opposite sides of the original debate converged on it, (b) it's the only regime where the primary evidence shows MAS reliably winning, and (c) it's exactly what the existing sk-* design already encodes.

---

## Open questions (for follow-up research)

1. **Cross-DOMAIN generalization of the matched-budget result.** F7/F8/F9 are scoped to text-only multi-hop reasoning on a narrow model/dataset/budget set. Does single-agent-under-matched-budget still win for tool-heavy, long-horizon, or non-code judgment tasks (the harness's actual target — "any domain")? The paper explicitly excludes tools/vision/safety.
2. **The corruption threshold in practice.** F9's crossover (α≈0.7) is one model/dataset/budget. What signal-density or noise level, in a real non-code domain, should trigger the harness to switch from single-agent to decomposition?
3. **Where exactly is the breadth/parallelism bar for THIS harness?** F11 gives qualitative criteria (high value, heavy parallelism, context overflow, many tools). What's the measurable threshold (subtask count? independence? expected token spend?) at which fan-out pays after the ~15× multiplier?
4. **Handoff minimalism vs completeness.** F5 says Inter-Agent Misalignment is ~37% of failures, but the "share full traces" prescription was *refuted* (0-3). What is the minimal-but-sufficient handoff payload that avoids misalignment without the lossy-channel cost of F8?

---

## Provenance & honesty notes

- **Recognized from training (high personal confidence):** *Let Me Speak Freely?* (2408.02442), Anthropic multi-agent research system, Cognition "Don't Build Multi-Agents", MAST / *Why Do Multi-Agent LLM Systems Fail?* (2503.13657).
- **Post-cutoff (Jan 2026) — cannot vouch from memory; relied on the workflow's adversarial verification:** *The Format Tax* (2604.03616), *Single-Agent LLMs Outperform MAS Under Equal Thinking Token Budgets* (2604.02460), Cognition `multi-agents-working` (2026-04). Verifiers reported independent corroboration (multiple search engines, public code repos github.com/ivnle/the-format-tax) and flagged WebFetch-summarizer hallucination risk explicitly, cross-checking the load-bearing quotes — but I did not re-fetch these myself. Spot-check before treating any single figure as load-bearing.
- **Self-reported, not peer-reviewed:** Anthropic's 90.2% and 15×/4×/80% figures (F10, F11) — undisclosed N, known compute confound. Cite AS Anthropic's self-reported result, not as independent finding.
- **Weakest-supported finding:** F8 (information-theoretic ceiling) — single source, vote 2-1; the theorem is sound under its idealized conditions but the "ceiling" framing should not be read as an unconditional law.
- **Convergence note:** the practitioner disagreement asked for (Cognition vs Anthropic) resolved into *agreement* on the breadth/read-only-vs-write split — that convergence is itself the strongest evidence here, stronger than either source alone.
