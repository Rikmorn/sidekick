# Sources — Prompting

Run `wf_60c4743b-ff1`, 2026-06-07. 22 sources / 5 angles / 25 verified. Reconstructed by orchestrator (synthesis file-write blocked). `[spot-checked]` = fetched by Claude.

## Declarative/imperative & instruction-following limits
- **arXiv:2509.21051 — ManyIFEval** (EMNLP 2025): all-instruction success collapses with count (~0.94→0.57→0.21 at 1/5/10), per-instruction stays ~0.85–0.90. **[spot-checked]**
- arXiv:2311.07911 — IFEval (recognized): GPT-4 misses ~1 in 6 atomic instructions.
- arXiv:2310.20410, 2506.08375 (EifBench), 2510.14842 (ScaledIF) — degradation with constraint count; several specific-threshold claims **refuted** here.

## Negative vs positive instructions (priority disconfirming angle)
- **arXiv:2601.21433 — "When Prohibitions Become Permissions"** (Jan 2026): negation followed less reliably; open-source 77%/100% endorse-prohibited under simple/compound negation, commercial 19–128% swings, holds at temp 0. Metric = IF on 14 ethical scenarios. **[spot-checked]** *("reasoning reduces it" is NOT in this paper.)*
- proceedings.mlr.press/v203/jang23a — Jang (recognized): negation handling; the *inverse-scaling* claim was **refuted** in this run.
- platform.claude.com prompt best-practices — Anthropic recommends positive over negative instructions.
- arXiv:2402.07896 (DPF).

## Constitutional / principle-based steering
- arXiv:2310.13798 — Specific vs General Principles for CAI (Anthropic, recognized): one general principle ≈ trait-specific; emergent harm-detection at ~175B.
- model-spec.openai.com/2025-12-18 — OpenAI Model Spec: hybrid (intent + tiered prohibitions + chain-of-command priority).

## Brittleness / "no debugger" cost
- arXiv:2310.11324, 2411.10541, 2410.02185, 2410.12405, 2510.05152, 2308.11483 — prompt sensitivity to phrasing/order/format (run-log, not re-checked).

## Durability / model-dependence / auto-optimization
- **arXiv:2505.11423 — "When Thinking Fails"** (Li et al., NeurIPS 2025): CoT degrades instruction-following; correlational; recoverable via selective reasoning. **[spot-checked]**
- arXiv:2506.14641 — zero-shot CoT can beat few-shot.
- arXiv:2507.19457 (GEPA, ICLR 2026), 2507.03620 (DSPy), cameronrwolfe (blog) — auto-prompt-optimization; wording gap closes most for small models.
