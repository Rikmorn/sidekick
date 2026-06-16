# Fixture: decide-cross-rfc-fail (decision contradicts its source RFC — cross-RFC coherence catches it)

**Dispatch:** `/sk-decide idempotency-key-strategy` (explicit topic).

**Setup:**

A source RFC exists at `.sidekick/plans/payment-retry/RFC.md`. Its `## Decisions` section contains:

```markdown
## Decisions

- D-01: Use a client-generated UUID as the idempotency key, scoped to the
  payment provider API call. Keys expire after 24 hours server-side.
```

The `sk-decision-drafter` drafts a decision whose `## Decision` section contradicts D-01 from the source RFC:

```markdown
## Decision

Use a server-generated sequence number as the idempotency key, issued at
request ingestion. The client does not generate or supply the key.
```

The drafter's returned JSON includes:

```json
{
  "mode": "draft_ready",
  "draft_path": ".sidekick/decisions/idempotency-key-strategy.md",
  "draft_text": "...",
  "source_rfc": "/abs/path/to/.sidekick/plans/payment-retry/RFC.md"
}
```

Because `source_rfc` is non-null, Step 7 of `/sk-decide` passes `related_paths: { rfc: source_rfc }` to `sk-coherence-checker`.

**Expected:**

`sk-coherence-checker` receives:

```json
{
  "artifact_path": "/abs/path/to/.sidekick/decisions/idempotency-key-strategy.md",
  "artifact_type": "decision",
  "related_paths": { "rfc": "/abs/path/to/.sidekick/plans/payment-retry/RFC.md" }
}
```

It reads both files, detects that `## Decision` (server-generated sequence number) contradicts `D-01` in the source RFC (client-generated UUID), and returns:

```json
{
  "verdict": "fail",
  "artifact_path": "...",
  "artifact_type": "decision",
  "issues": [
    {
      "kind": "contradiction",
      "locus_a": { "section": "## Decision", "text": "server-generated sequence number" },
      "locus_b": { "section": "payment-retry/RFC.md § D-01", "text": "client-generated UUID" },
      "detail": "Decision contradicts source RFC D-01: RFC requires client-generated UUID; decision chooses server-generated sequence number."
    }
  ]
}
```

The `/sk-decide` orchestrator receives `verdict: fail`, collapses the issues into prose `feedback`, re-dispatches `sk-decision-drafter`, and runs the quorum again.

PASS = `sk-coherence-checker` is invoked with `related_paths.rfc` (not omitted) + returns `verdict: fail` citing the RFC-vs-decision contradiction + the orchestrator re-dispatches with feedback.

FAIL = `related_paths` is omitted (internal-only check) and the cross-RFC contradiction is not caught; or `sk-coherence-checker` returns `pass` despite the contradiction.

> **Session-registry note:** `sk-coherence-checker` is dispatched as a subagent from the main-session `/sk-decide` skill. If the agent was recently installed, dispatch from a session that has received the "new agent types available" notification, not necessarily a brand-new session.
