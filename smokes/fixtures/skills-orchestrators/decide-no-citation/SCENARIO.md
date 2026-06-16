# Fixture: decide-no-citation (decision derives from no RFC — coherence check stays internal-only)

**Dispatch:** `/sk-decide log-retention-policy` (explicit topic).

**Setup:**

No `.sidekick/plans/*/RFC.md` files exist (or none are recent). The `sk-decision-drafter` drafts a standalone decision — e.g. "Retain application logs for 90 days; purge after" — grounded only in the topic itself and the Q&A session, not derived from any RFC. Its returned JSON:

```json
{
  "mode": "draft_ready",
  "draft_path": ".sidekick/decisions/log-retention-policy.md",
  "draft_text": "...",
  "source_rfc": null
}
```

**Expected:**

Because `source_rfc` is `null`, Step 7 of `/sk-decide` omits `related_paths` from the `sk-coherence-checker` dispatch:

```json
{
  "artifact_path": "/abs/path/to/.sidekick/decisions/log-retention-policy.md",
  "artifact_type": "decision"
}
```

`sk-coherence-checker` runs the **internal-only** lens — checking that the decision's own sections are consistent with each other (e.g., chosen option matches `## Consequences`, `## Decision` matches the stated `## Context`) — without reading any source RFC. No cross-RFC check is attempted.

If the decision is internally consistent, `sk-coherence-checker` returns `verdict: pass` and the flow continues to the user confirm and commit.

PASS = `related_paths` absent from the checker dispatch + `sk-coherence-checker` performs only internal checks + `verdict: pass` on a coherent decision.

FAIL = orchestrator passes `related_paths: { rfc: null }` or any RFC path when `source_rfc` is null; or the checker attempts to read an RFC file it wasn't given; or the flow halts unexpectedly on the no-RFC path.

> **Contrast with 15.8:** In `decide-cross-rfc-fail`, `source_rfc` is a non-null absolute path and the cross-RFC check fires. Here `source_rfc` is `null` and it is suppressed. Both paths share the same orchestration logic at Step 7 — the branch is `if (source_rfc) add related_paths`.
