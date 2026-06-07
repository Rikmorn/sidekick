# Sources — Agent Communication & Orchestration (Track C)

Collected 2026-06-06 via the deep-research workflow. Primary sources prioritized; the
practitioner disagreement (Cognition vs Anthropic) deliberately included. Each entry notes
what it supports and the verification vote where applicable.

## Sub-question 1 — Structured output vs natural language between agents

- **Let Me Speak Freely? A Study on the Impact of Format Restrictions on LLM Performance**
  (Tam et al., EMNLP 2024 Findings / Industry Track) — arXiv:2408.02442 /
  aclanthology.org/2024.emnlp-industry.91.pdf
  The canonical reference for the format-vs-reasoning debate. Key surviving findings:
  format restriction's impact is TASK-DEPENDENT (hurts reasoning, helps classification by
  constraining the answer space); and NL-to-Format (reason free-form, then convert) matches
  unrestricted natural-language performance across most models. Supports F1, F2, F3.
  NOTE: the specific magnitude numbers (27-pt GSM8K drop; 38.15% LLaMA-3-8B gap) were
  KILLED in verification (1-2) — cite the direction, not the figures.

- **The Format Tax: Structured Output Requirements Degrade LLM Reasoning** (Lee, D'Antoni,
  Berg-Kirkpatrick, UC San Diego, Apr 2026) — arXiv:2604.03616 / code:
  github.com/ivnle/the-format-tax
  6 open-weight + 4 API models, 4 formats (JSON/XML/LaTeX/Markdown), tasks MATH-500 /
  GPQA-Diamond / ZebraLogic / WritingBench. Three load-bearing results:
  (1) structured output substantially degrades reasoning/writing on open-weight models;
  (2) ABLATION shows the cost enters at the PROMPT (format-requesting instruction alone =
  −3.9pp avg; constrained decoding adds only −1.6pp; 92% of significant effects in
  prompt-only conditions) — supports F1's causal claim;
  (3) decoupling reasoning from formatting (freeform-then-reformat, OR extended thinking)
  recovers most lost accuracy — supports F2.
  SCOPE: recent CLOSED-weight models (Claude-Haiku, Grok-4.1-fast, GPT-5.4-nano) show
  little-to-no format tax. The strong "purely an open-weight capability gap" framing was
  KILLED (1-2); the measured "closed models show little tax" survives (F3).
  POST-CUTOFF — verified by the workflow via independent multi-engine corroboration + public
  code repo; WebFetch-summarizer hallucination flagged and cross-checked. Not re-fetched by me.

## Sub-question 2 — Single strong agent vs multi-agent systems (the practitioner disagreement)

- **Don't Build Multi-Agents** (Walden Yan, Cognition, mid-2025) —
  cognition.ai/blog/dont-build-multi-agents
  The anti-MAS practitioner essay. Mechanism: actions carry implicit decisions; parallel
  agents make conflicting implicit choices about style/edge-cases/patterns → fragile, incoherent
  combined output (Flappy Bird example). Supports F10(c). Mechanism-level argument, not a
  quantified benchmark. NOTE: the "context can't be shared thoroughly enough" phrasing of the
  CAUSE was KILLED (0-3), as was "must share full agent traces" (0-3) — the conflicting-decisions
  mechanism survives, the prescriptions did not.

- **Multi-Agent Systems That Work** (Cognition, 2026-04-22) —
  cognition.ai/blog/multi-agents-working
  The REFINEMENT (not reversal) by the same author: MAS works best when WRITES STAY
  SINGLE-THREADED and additional agents contribute INTELLIGENCE (analysis/review) rather than
  conflicting ACTIONS; read-only subagents "mostly resemble tool calls rather than true
  multi-agent collaboration." Supports F10(b). POST-CUTOFF — workflow-verified, current.

- **Multi-Agent Research System** (Anthropic engineering blog, mid-2025) —
  anthropic.com/engineering/multi-agent-research-system
  The canonical PRO-MAS result and the opposing pole. Opus-4-lead + Sonnet-4-subagents beat
  single-agent Opus 4 by 90.2% on internal research eval (breadth-first queries pursuing
  independent directions). ALSO the economics: MAS ~15× chat tokens, agents ~4×; token usage
  alone explains 80% of BrowseComp variance; "work mainly because they help spend enough tokens."
  AND the carve-out: shared-context / heavy-inter-agent-dependency tasks (most coding) are "not
  a good fit"; "LLM agents are not yet great at coordinating and delegating in real time."
  Supports F10(a), F11. CAVEAT: self-reported, undisclosed N, compute confound — cite AS
  Anthropic's self-reported result.

- **Why Do Multi-Agent LLM Systems Fail? (MAST)** (Cemri, Pan et al., UC Berkeley; NeurIPS 2025
  Datasets & Benchmarks) — arXiv:2503.13657 / OpenReview MqBzKkb8eK
  The rigorous failure taxonomy. MAS gains "often minimal"; 7 SOTA open-source MAS fail
  41%–86.7%. 14 failure modes in 3 categories: Specification/System-Design (41.8%),
  Inter-Agent Misalignment (36.9%), Task Verification (21.3%); grounded theory from 150 traces
  (Cohen's κ=0.88), applied to ~1242 traces. Failures are ARCHITECTURAL — tactical fixes give
  insufficient gains (ChatDev +14%, still not deployable). Supports F4, F5, F6.

## Sub-questions 3 & 4 — Orchestrator-worker handoff, context, and economics

- **Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking
  Token Budgets** (Dat Tran & Douwe Kiela, 2026) — arXiv:2604.02460
  The compute-normalization correction. Under MATCHED thinking-token budgets, SAS matches/beats
  MAS across Qwen3-30B, DeepSeek-R1-Distill-Llama-70B, Gemini 2.5 (6 budgets, 5 MAS architectures,
  FRAMES + MuSiQue); many reported MAS wins are confounded by unaccounted compute/context.
  Supports F7. Also: the Data-Processing-Inequality argument (Y–C–M Markov chain; single agent
  with full C ≥ MAS over M=g(C) under fixed budget + perfect context use) — F8 (vote 2-1).
  And the corruption boundary: Sequential MAS beats SAS only at heavy corruption (α=0.7) on
  MuSiQue, SAS leads at mild (α=0.3); corruption flips it, not length — F9.
  SCOPE: text-only multi-hop reasoning; tools/vision/safety explicitly out of scope.
  POST-CUTOFF — workflow-verified via HTML + PDF fetch + non-leading cross-searches.

## Sub-question 5 — Multi-agent specifically for VERIFICATION (carry from Track A)

The verification use case is carried by the read-only/analysis findings above, NOT a separate
source set: F10 (read-only subagents = "intelligence not actions"; verification/review loops are
the safe class) + Track A's cross-FAMILY quorum, debate, and adversarial verification
(see ../verification-autonomy/REPORT.md findings 5–8). The defensible split
"multi-agent for verification/breadth, single-agent for generation" rests on the CONVERGENCE of
Anthropic (read-only research subagents win) and Cognition (writes single-threaded, agents add
intelligence) — neither source alone, but their agreement.

## Buckets (for this track's findings)

- IN-REPO actionable: specialist contract (reason in prose, JSON at the boundary — already
  sk-agent-prompts.md Rule 7); structure for classification/voting only; default single-agent,
  justify MAS per task; parallel=read-only / writes=single-threaded; design orchestrators against
  the 14 MAST failure modes; route to decomposition on noisy/corrupted (not merely large) inputs;
  multi-agent stays the legitimate VERIFICATION mechanism.
- HARNESS/CONFIG actionable: avoid grammar-constrained decoding on reasoning steps; gate MAS
  dispatch on task value/parallelism and budget the ~15× multiplier; normalize compute before
  trusting a "MAS won" comparison.
- MODEL/PROVIDER-level (track only): closed-model near-zero format tax (may shift); models'
  real-time coordination/delegation ability (improves with capability).

## Durability lens

- DURABLE (leverages the reasoning engine via structural arrangement): reason-free-form-then-format;
  single-threaded writes + parallel read-only analysis; compute-normalized comparison; value-gated
  fan-out; DPI "don't fragment context without buying something." None is a hand-built program a
  stronger model obviates.
- TRACK-ONLY (capability artifacts): the MAGNITUDE of the format tax (already near-zero on closed
  frontier models); models' coordination skill. The DIRECTION of the orchestration findings is
  DISCONFIRMING for "stronger models will make naive multi-agent win" — F7 (compute confound) and
  F8 (info-theoretic ceiling) say a single strong agent with full context is the baseline to beat.
