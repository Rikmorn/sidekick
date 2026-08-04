---
id: bench-3
epic: bench
kind: item
status: done
deps: [bench-1]
implements: [adr-0008]
grounds: [research/eval-harness, research/verification-autonomy]
---

# bench-3 — Chain corpora wave 1: verifier-class

**Goal.** The five defect-scanning review dimensions (`sk-correctness-reviewer`, `sk-security-reviewer`, `sk-maintainability-reviewer`, `sk-test-reviewer`, `sk-architecture-reviewer`) plus `sk-goal-verifier` — six verifier-class subjects — measured as classifiers against seeded labelled corpora: the proven `calibration-coherence` pattern, generalised.

**Spec.**
- **Per subject: a seeded labelled corpus** (~10–20 cases: planted defects + known-clean fixtures; labels free by construction). Seeds agent-authored; a sample per corpus goes to the operator for the realism spot-audit (ADR-0008 D4) — the audit is the item's operator touchpoint, not fixture authoring.
- **Classifier metrics live:** precision/recall/consistency per subject computed by `eval report` from the registry definitions; `quality` for this kind = label agreement.
- **Calibration where a subject should graduate:** the certificate protocol (ADR-0006 D3) run for any dimension the operator wants binding-capable; others stay advisory with trends.
- **Fixture realism note:** seeds derive from real repo artifacts wherever possible (past review findings, the smokes' fixture stock) rather than synthetic toys — the flattery risk is named in the ADR; derivation-from-real is its cheapest mitigation.

**Gates.** Every wave-1 subject has a committed corpus + at least one committed run set with per-metric values; spot-audit sample delivered to the operator; no `manual: true` case counted as coverage.

---

## Completion synthesis (2026-08-04)

**Outcome.** Six corpora, 60 seeded labelled cases (43 planted / 17 clean), all committed with `__base__` two-commit diff fixtures; run set **`bench-3-w1`** committed — 60/60 records, zero invocation errors. Metric frame: every wave-1 subject **meets thresholds** — quality: architecture 1.00, goal-verifier 1.00, maintainability 1.00, correctness 0.90, test 0.90, security 0.80 (exactly at threshold); consistency and adherence 1.00 everywhere (consistency is trivial at k=1 — the next run set should sweep `--k 2`+ for real stability signal); grounding null-with-reason everywhere (no grounding-tagged assertions yet — the tag mechanism is live, corpora simply don't use it yet).

**Headline finding: recall 1.0, precision is the frontier.** All 43 planted defects were caught; all 4 misses are clean cases flagged (`clean-guarded-feature`, `clean-allowlist-export`, `clean-authz-helper`, `clean-behaviour-preserving-refactor`) — and in each the reviewer's flag is *defensible* (hex-parsing port edge case; plain-object allow-list passing `constructor`/`__proto__` through an `undefined` guard; 404-vs-403 enumeration oracle; untested lookup-order risk in a refactor). **Calibration question this raises for the registry:** the any-findings→fail verdict mapping is harsh on minor-only deliverables — a severity floor (e.g. `findings` counts as fail only at ≥important) is a registry-data decision for the operator, not a corpus fix.

**Decisions made during execution.**
1. **Kernel before corpora:** the `__base__` overlay convention, reviewer-status/goal-verdict normalization, and matches-on-JSON landed TDD'd first (commit `77acb53`); one live smoke proved the reviewer→diff→deliverable path before any fan-out.
2. **Drift found and reconciled:** corpus authoring surfaced that `sk-architecture-reviewer` declared `verdict: pass|findings` against the family's `status: passed|findings` schema — reconciled to the family (`13563b1`) and the installed roster re-synced (it dated from 2026-07-07). The measurement program caught real drift before its first measurement ran.
3. **Fan-out with disjoint scopes:** five parallel authors, each confined to their suite+fixture dirs; every author independently simulated the two-commit prep and verified `git diff HEAD~1..HEAD` matches declared `changed_files`.
4. **Corpora are as hermetic as the harness, no more:** `sk-maintainability-reviewer` resolves rules from the installed `~/.claude/sidekick/rules/` copy in eval workspaces; copying rules into fixtures was rejected (33KB × 10, no sync). The eval lane already requires an installed roster, so this adds no new dependency.
5. **Author-flagged label risks, standing:** security/`weak-password-hash` (SHA-1 severity could be rated minor — safe today, revisit if severity assertions land); goal-verifier/`orphaned-promo-pricing` (a failed-truth-with-VERIFIED-artifacts reading would be a correct verdict the assertion shape misses — did not occur in w1).

**Spot-audit sample (the operator touchpoint, ADR-0008 D4).** Adjudication wanted on the four false-positive clean cases above — each is "reviewer defensibly right vs label defensibly right"; re-label, fix the fixture, or accept as precision cost. Realism check per corpus (2 planted cases each): correctness `inverted-retry`/`missing-await`; security `sql-injection-search`/`mass-assignment-profile`; maintainability `unparsed-webhook-body`/`query-mutates-store`; test `mocked-away-behaviour`/`stale-test-untouched`; architecture `inverted-dependency`/`port-seam-bypassed`; goal-verifier `stub-category-filter`/`hollow-digest-data`. All defects were varied away from the agents' own worked examples.

**Not done (deliberately).** Calibration certificates (spec: only "where a subject should graduate" — an operator call, none requested); grounding-tagged assertions (bench-4 scope); severity-floor normalization (registry decision pending operator adjudication of the four cases).
