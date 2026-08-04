---
slug: session-expiry
created: 2026-07-22
status: locked
---

## Goals & non-goals

- g1: a request carrying an expired session is rejected — `authorize` returns a
  `session_expired` failure instead of an authorised result.
- Non-goal: refresh tokens or silent re-authentication.

## Architecture

`isExpired` in `src/auth/expiry.ts` is a pure predicate over the session's
`expiresAt` stamp and the current time. The request guard in `src/auth/guard.ts`
is the single enforcement point: it already rejects an absent session, and now
also rejects an expired one before returning an authorised result.

## Decisions

- D-01: expiry is compared against a caller-supplied `now`, so the guard stays
  pure and testable.
- D-02: an expired session fails with reason `session_expired`, distinct from
  the `no_session` case.

## Risks

- A predicate that is computed but not acted on leaves every expired session
  authorised while looking implemented from the outside.
