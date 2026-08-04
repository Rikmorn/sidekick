---
slug: inverted-dependency
created: 2026-07-28
status: locked
---

# Overdue invoice listing

Give the billing dashboard a paged view of invoices that are past due.

## Goals & non-goals

- **g1:** The dashboard can page through overdue invoices without knowing the
  database schema.
- **g2:** The repository layer stays independently testable — no transport
  concerns leak into it.

Non-goals: authentication; anything richer than a single opaque cursor.

## Decisions

- **D-01:** Cursors are opaque base64 strings, decoded at the transport edge.

## Architecture

Three layers, and imports only ever point downwards:

`src/handlers/` → `src/repositories/` → `src/db/`

- **Handlers** own transport: parsing query strings, decoding cursors, shaping
  responses. A handler calls repositories and nothing below them.
- **Repositories** own persistence. A repository may import `src/db/` and
  `src/types.ts`. It never imports from `src/handlers/` — the arrow does not
  reverse for convenience.
- **`src/db/`** holds the pool handle and the query primitive. It imports
  nothing from the project except `src/types.ts`.

`src/types.ts` holds shared shapes and may be imported by any layer.

## Questions

(none)

## Risks

- Cursor decoding lives in the handler, so a second transport would need its
  own decoder. Accepted: one transport today.
