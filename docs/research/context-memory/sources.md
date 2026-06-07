# Sources — Track B (Context & Memory)

Run `wf_e1baddf0-6d2`, 2026-06-06. 22 sources fetched across 5 angles; 25 claims verified.
Reconstructed by orchestrator from the run's captured source list (synthesis file-write was blocked).
`[spot-checked]` = fetched and confirmed by Claude; others are from the run log.

## Angle 1 — Long-context degradation mechanics
- arXiv:2307.03172 — *Lost in the Middle* (Liu et al.) — positional degradation; begin/end >> middle. (primary, recognized)
- trychroma.com/research/context-rot — Chroma "context rot"; reliability depends on more than position; distractors. (primary, recognized)
- **arXiv:2510.05381** — input length ALONE degrades (13.9–85%) even with perfect retrieval/no distractors; gradual not cliff; mitigation = recite evidence before solving. EMNLP 2025 Findings. **[spot-checked]**
- anthropic.com/engineering/effective-context-engineering-for-ai-agents — compaction, sub-agent isolation; the n²-mechanism claim was REFUTED 0-3 (cite effect, not cause). (primary, recognized)
- arXiv:2510.22956 — long-context effective-use limitations. (primary; not re-checked)
- arXiv:2602.07962 — long-context degradation (post-cutoff; not re-checked)

## Angle 2 — LLM metacognition / awareness-to-use gap (central)
- **arXiv:2605.14186** — confidence signals exist but unused by default; external control harness turns them into a control interface (48.3→56.9). "require an explicit control harness to act on it." **[spot-checked]**
- arXiv:2603.22161 — metacognition (post-cutoff; not re-checked; likely source of the activation-steering claim)
- arXiv:2606.00198 — metacognition/abstention (post-cutoff; not re-checked)

## Angle 3 — Agent memory architectures & episodic recall
- arXiv:2603.07670 ; arXiv:2502.06975 ; arXiv:2602.06052 ; arXiv:2602.19320 ; preprints.org/manuscript/202601.0618 (all primary; not re-checked — several post-cutoff)
- atlan.com/know/types-of-ai-agent-memory/ (blog) — working/episodic/semantic/procedural taxonomy
- NOTE: this angle under-delivered; memory taxonomy not synthesized into verified findings.

## Angle 4 — Local bundled-CLI retrieval substrate (UNDER-COVERED)
- towardsdatascience.com — *MemWeave*: markdown + SQLite, no vector DB. (blog)
- anthropic.com/news/contextual-retrieval — contextual retrieval. (primary, recognized)
- alexgarcia.xyz — sqlite-vec hybrid search. (blog)
- NOTE: no verified finding on substrate; leads only. The substrate decision remains open.

## Angle 5 — Memory poisoning / measured drift / when no-memory wins
- arXiv:2512.16962 — MemoryGraft (poisoned memory persists until cleaned). (post-cutoff)
- arXiv:2603.11768 — SSGM, evolving-memory governance; validate-before-consolidate. **[spot-checked in Track A]**
- arXiv:2605.18565 ; arXiv:2601.05504 — memory governance (post-cutoff; not re-checked)
