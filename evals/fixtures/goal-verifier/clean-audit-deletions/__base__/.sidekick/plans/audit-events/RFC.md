---
slug: audit-events
created: 2026-07-06
status: locked
---

## Goals & non-goals

- g1: every account-deletion request is recorded in the audit log with the
  actor, the target account, and whether the account was actually removed.
- Non-goal: auditing reads — only state-changing account operations are logged.

## Architecture

The existing `AuditLog` already accepts entries; what is missing is a recorder
that knows the shape of a deletion entry and a call from the deletion path.
`recordAccountDeletion` builds the entry and appends it; `deleteAccount` calls
it on every request, passing the outcome it observed, so the log has one row per
request rather than one per success.

## Decisions

- D-01: the action name is `account.delete` and the outcome is `deleted` or
  `not_found`.
- D-02: the recorder takes the timestamp as an argument rather than reading the
  clock, so the deletion path stays testable.

## Risks

- Recording after the removal means a crash between the two loses the entry;
  acceptable while the log is advisory rather than a compliance record.
