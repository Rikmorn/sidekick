---
slug: session-expiry
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-07-22
---

## Checklist

- [x] T-01 [g1] — add the `isExpired` predicate
- [x] T-02 [g1] — reject expired sessions in the request guard

## Tasks

### T-01 — add the `isExpired` predicate

**Deps:** (none)
**Files:** src/auth/expiry.ts

Compare `session.expiresAt` against a caller-supplied `now` (D-01).

### T-02 — reject expired sessions in the request guard

**Deps:** T-01
**Files:** src/auth/guard.ts

Call `isExpired` in `authorize` and return a `session_expired` failure when it
holds, before any authorised result is returned (D-02).
