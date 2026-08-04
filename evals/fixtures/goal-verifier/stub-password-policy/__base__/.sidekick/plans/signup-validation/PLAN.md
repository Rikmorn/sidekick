---
slug: signup-validation
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-07-24
---

## Checklist

- [x] T-01 [g1] — add the duplicate-email check
- [x] T-02 [g2] — add the password strength policy
- [x] T-03 [g1,g2] — run both checks before inserting the account

## Tasks

### T-01 — add the duplicate-email check

**Deps:** (none)
**Files:** src/accounts/duplicate.ts

Normalise the address per D-01 and ask the store whether it already exists.

### T-02 — add the password strength policy

**Deps:** (none)
**Files:** src/accounts/password.ts

Decide from the submitted password whether it satisfies D-02, returning the
failing rule so the caller can report it.

### T-03 — run both checks before inserting the account

**Deps:** T-01, T-02
**Files:** src/accounts/signup.ts

Run the duplicate check and the policy check before the insert, returning the
first failure rather than creating the account.
