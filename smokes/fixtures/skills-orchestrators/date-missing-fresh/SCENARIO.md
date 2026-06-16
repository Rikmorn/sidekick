# Fixture: date-missing-fresh (drafter dispatched without `today` — fresh vs re-dispatch behaviour)

**Dispatch:** `sk-rfc-drafter` (the subagent directly, or via `/sk-design` with a deliberate orchestrator bug omitting `today`).

## Part A — fresh draft, `today` absent

**Inputs:**

```json
{
  "slug": "rate-limit-middleware",
  "scope_statement": "Add a per-tenant rate-limiting middleware to the API gateway.",
  "complexity": "medium",
  "architecture_section": "## Architecture\n\n### Recommendation: token-bucket per tenant\n...",
  "analogues": [{ "path": "src/middleware/auth.ts", "why_relevant": "same middleware shape" }]
}
```

`today` is **absent** (omitted — simulating a bug in the orchestrator or a direct dispatch without the required field). `feedback` is also absent — this is a fresh draft.

**Expected:**

The drafter detects `today` is missing on the fresh-draft path and returns:

```json
{ "error": "missing_input", "reason": "today is required for a fresh draft" }
```

It does NOT invent a date (e.g. it does not default to the current system date on its own). It does NOT produce a `draft_ready` deliverable. The orchestrator that dispatched it receives the error and should surface it to the user rather than writing a malformed RFC.

PASS = `{ "error": "missing_input", … }` returned + no `draft_text` produced.

FAIL = the drafter invents a date and returns `draft_ready`; or returns a draft with a blank or placeholder `created:` field.

---

## Part B — re-dispatch, `today` absent, existing `created:` preserved

**Setup:**

A `.sidekick/plans/rate-limit-middleware/RFC.md` already exists on disk with:

```markdown
---
slug: rate-limit-middleware
created: 2026-06-10
status: draft
---
```

**Inputs:**

```json
{
  "slug": "rate-limit-middleware",
  "scope_statement": "Add a per-tenant rate-limiting middleware to the API gateway.",
  "complexity": "medium",
  "architecture_section": "## Architecture\n\n### Recommendation: token-bucket per tenant\n...",
  "analogues": [{ "path": "src/middleware/auth.ts", "why_relevant": "same middleware shape" }],
  "feedback": "sk-coherence-checker: Architecture recommends token-bucket but D-01 decides sliding-window — reconcile."
}
```

`today` is **absent**. `feedback` is present — this is a re-dispatch.

**Expected:**

The drafter reads the existing RFC.md, integrates the feedback (reconciling `## Architecture` to the sliding-window approach per D-01), and returns `draft_ready`. The `created:` frontmatter field in the returned `draft_text` is **byte-equal** to `2026-06-10` — the value read from the existing file. The drafter does NOT use the current system date, does NOT require `today` to be passed, and does NOT leave `created:` blank.

Every section the feedback does not target (Goals, Decisions, Questions, Risks) is byte-equal to the existing file.

PASS = `{ "mode": "draft_ready", "draft_text": "..." }` returned + `created: 2026-06-10` preserved byte-equal + Architecture reconciled to D-01 + other sections unchanged.

FAIL = `created:` is updated to a new date; or the drafter returns `missing_input` for `today` on the re-dispatch path (the re-dispatch contract explicitly does not require `today`); or the drafter fails to reconcile Architecture.

---

> **Why this matters:** The `today` field gates whether the drafter can write a new `created:` date. On fresh drafts it must be supplied by the orchestrator (via `date +%Y-%m-%d`); on re-dispatches the existing `created:` is the source of truth. A drafter that invents dates or requires `today` on re-dispatch breaks both sides of the contract.

> **Session-registry note:** `sk-rfc-drafter` is a subagent dispatched from the main-session `/sk-design` skill. If it was recently installed or modified, dispatch from a session that has received the "new agent types available" notification.
