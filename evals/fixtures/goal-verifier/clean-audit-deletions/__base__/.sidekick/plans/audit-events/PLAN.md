---
slug: audit-events
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-07-06
---

## Checklist

- [x] T-01 [g1] — add the account-deletion audit recorder
- [x] T-02 [g1] — record every deletion request from the deletion path

## Tasks

### T-01 — add the account-deletion audit recorder

**Deps:** (none)
**Files:** src/audit/record.ts

Build the `account.delete` entry from the actor, target, and outcome, and append
it to the log (D-01, D-02).

### T-02 — record every deletion request from the deletion path

**Deps:** T-01
**Files:** src/accounts/delete.ts

Call the recorder on every request with the outcome the removal returned.
