---
slug: clean-new-repository
created: 2026-08-01
status: locked
---

# Audit trail for profile edits

Record who changed a user profile and when.

## Goals & non-goals

- **g1:** Every profile update writes an audit row.
- **g2:** An audit schema change touches one module.

Non-goals: retention policy; exposing the audit trail over the API.

## Decisions

- **D-01:** Audit writes are best-effort and never fail the update they
  describe — a failed audit write is logged, not propagated.

## Architecture

Three layers, imports pointing downwards only:

`src/handlers/` → `src/repositories/` → `src/db/`

- **Handlers** own transport: validating input, shaping responses. A handler
  calls repository functions and nothing lower.
- **Repositories** own persistence. One module per table, exposing
  intention-named functions. `src/db/client.ts` is imported only from here.
- **`src/db/`** holds the pool and the query primitive.

`src/types.ts` holds shared shapes any layer may import.

## Questions

(none)

## Risks

- Best-effort audit writes can silently lose rows under load. Accepted per
  D-01 for this iteration.
