---
id: bench-1
epic: bench
kind: item
status: done
deps: []
implements: [adr-0008]
grounds: [research/eval-harness]
---

# bench-1 — Metric registry + report semantics

**Goal.** The metrics vocabulary as data the kernel validates and computes — not prose. After this item, "what do we measure and how is it computed" is a schema question with one answer.

**Spec.**
- **Registry:** typed metric definitions (location settled at build — `evals/metrics/` or a registry file beside the case convention): name · subject-kinds it applies to · assertion types that feed it · deterministic computation semantics · **required bias/caveat field** · per-subject-tunable thresholds (gate inputs, ADR-0008 D6). Unknown kinds/fields are lint findings (closed-vocabulary discipline, per ADR-0007 D1's precedent).
- **The four v1 metrics** (ADR-0008 D2): quality (per-kind, D3 shapes) · consistency (pass^k, verdict unanimity) · adherence (deliverable shape, read-only/scope compliance — mechanical) · grounding (evidence-exists + conclusion-follows, judge-checked, calibrated).
- **`eval report` computes them:** per-subject per-metric values derived from `records.jsonl` + registry, unit-tested kernel code (TDD). The existing pass@k/pass^k reporting folds into the metric frame rather than living beside it.
- **Adoption wiring:** report output is the substrate bench-2 parses; `--json` contract documented for the graph parser.

**Gates.** `bun test` green; a registry entry with an unknown subject-kind or missing bias field fails lint; `eval report` over the existing `3-3-w4` records produces per-metric values for the already-measured subjects without touching the records.

---

## Completion synthesis (2026-08-04)

**Outcome.** The registry ships at **`evals/metrics.json`** — the 18 chain subjects classed (10 verifier / 3 producer / 2 executor / 3 orchestrator) and the four v1 metrics, each carrying its required bias text and threshold data (quality 0.8, adherence/consistency 0.9, grounding 0.8). `bin/helpers/eval-metrics.ts` owns schema + closed-vocabulary validation; `eval report` emits the metric frame ahead of the suite rollups; graph lint routes registry violations as error-tier `invalid-metric` findings. Live over `3-3-w4`: sk-coherence-checker quality 1.0 (n=8, label-match), sk-rfc-drafter quality 1.0 (n=4, judge-pass), sk-structural-checker quality 1.0 (n=1); consistency and adherence 1.0 across all three; records file untouched (hash-verified).

**Decisions made during execution.**

1. **One registry file, not a per-metric directory.** Duplicate-name and cross-reference checks need the whole registry in hand; the authoring skill (bench-5) edits one surface; graph-build gets one route.
2. **Subjects keyed by graph entity id, resolved by the graph's own resolver.** `eval-report` imports `subjectEntityId` from `graph-parse-machine` rather than re-deriving identity — the same value is never computed two ways.
3. **A `verdict equals pass|fail` structured assertion is read as the case label.** The pre-registry corpora encode expected verdicts exactly this way; without the fallback no verifier subject would have a quality value over existing records. An explicit `label` still wins.
4. **Assertion-level `metric` tags route assertions to metrics; untagged feeds quality.** The runner copies tags into records. Grounding therefore reports `null` with a reason over `3-3-w4` — a visible coverage gap for bench-3's corpora to close, not a zero.
5. **Consistency is verdict unanimity when deliverables carry verdicts (consistently-wrong counts as stable), else pass^k** — which is how pass^k folds into the metric frame instead of living beside it.
6. **An invalid registry fails loudly twice**: `eval report` exits 1 rather than computing against garbage, and graph lint raises error-tier findings (proven end-to-end by breaking the live file and watching both).
7. **Metric/run-set graph entities deferred to bench-2** as the item specifies — the registry parse contributes findings only for now.

**Deviation.** None from spec. Noted in passing: `biome check` fails on pre-existing findings in `graph-query.ts`/`graph-parse-work.ts` (verified present before this item via stash); left untouched as out of scope.

**Verification.** Gates run by the building session; independent verification owed (Rule 5) — a reviewing session should reproduce the `3-3-w4` metric frame and the lint failure mode before bench-2 parses the report contract.
