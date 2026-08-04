---
slug: clean-service-extraction
created: 2026-08-03
status: locked
---

# Shipping bands on order totals

Charge shipping by weight band instead of a flat fee.

## Goals & non-goals

- **g1:** An order total includes the shipping charge for its weight band.
- **g2:** Band arithmetic is unit-testable without a database.

Non-goals: carrier integration; international rates.

## Decisions

- **D-01:** Bands are half-open intervals on grams, so a weight on a boundary
  falls into exactly one band.

## Architecture

Four layers, imports pointing downwards only:

`src/handlers/` → `src/services/` → `src/repositories/` → `src/db/`

- **Handlers** own transport and call services.
- **Services** own business rules. A service may import its siblings inside
  `src/services/`, and may call repositories. Pure calculation belongs in a
  service-layer module, not in a repository.
- **Repositories** own persistence; they are the only importers of
  `src/db/client.ts` and they never import upwards.
- **`src/db/`** holds the pool and the query primitive.

## Questions

(none)

## Risks

- Band tables in code need a deploy to change. Accepted for now.
