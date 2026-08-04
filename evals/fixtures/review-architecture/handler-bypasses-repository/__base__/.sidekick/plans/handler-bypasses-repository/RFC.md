---
slug: handler-bypasses-repository
created: 2026-07-29
status: locked
---

# Session expiry sweep

Add an operator-triggered sweep that clears expired sessions.

## Goals & non-goals

- **g1:** An operator can clear expired sessions through the existing admin
  surface.
- **g2:** Every statement that touches the sessions table is visible in one
  file, so an index change has one place to look.

Non-goals: scheduling the sweep; soft deletes.

## Decisions

- **D-01:** Expiry is evaluated server-side against the database clock, so the
  sweep is deterministic regardless of which host runs it.

## Architecture

All database access flows through `src/repositories/`.

- `src/db/client.ts` owns the pool and the `query` primitive. It is imported
  **only** by modules under `src/repositories/` — that restriction is what makes
  "one file per table" true.
- Each table gets one repository module exposing intention-named functions
  (`findActive`, `deleteExpired`), never raw SQL to its callers.
- `src/handlers/` owns transport. A handler calls repository functions; it does
  not build SQL and does not import `src/db/`.

## Questions

(none)

## Risks

- A repository function per intent means more small functions. Accepted — the
  alternative is SQL scattered across handlers.
