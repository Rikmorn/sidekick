---
slug: misplaced-module
created: 2026-07-30
status: locked
---

# Loyalty discounts at checkout

Apply a loyalty-tier discount when a cart is priced.

## Goals & non-goals

- **g1:** Checkout totals reflect the customer's loyalty tier.
- **g2:** A pricing rule change can be reviewed without reading persistence
  code, and vice versa.

Non-goals: promotional codes; per-item discounts.

## Decisions

- **D-01:** Tier thresholds are constants in code for now, not configuration —
  they change once or twice a year and a code change is the audit trail.

## Architecture

Layering is `src/handlers/` → `src/services/` → `src/db/`, and each directory
owns one kind of thing:

- **`src/services/`** is where business rules live: eligibility, tier
  thresholds, discount arithmetic, anything a product owner would argue about.
  A service may import `src/db/`.
- **`src/db/`** is persistence infrastructure only — the pool handle, the query
  primitive, row-mapping helpers. No business rule lives under `src/db/`; a
  module that encodes a policy belongs in `src/services/` even when its data
  comes from a table.
- **`src/handlers/`** owns transport and calls services.

## Questions

(none)

## Risks

- Constants in code mean a deploy to change a threshold. Accepted per D-01.
