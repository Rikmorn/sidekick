---
slug: cross-slice-internals
created: 2026-08-02
status: locked
---

# Invoice lines from orders

Build an invoice from the orders a customer placed in a billing period.

## Goals & non-goals

- **g1:** An invoice lists one line per order in the period.
- **g2:** The orders slice can change its row shape without breaking billing.

Non-goals: tax; multi-currency.

## Decisions

- **D-01:** Invoice lines store a rendered description string, not a reference
  to the order, so a later order edit does not rewrite history.

## Architecture

The codebase is organised as vertical feature slices under
`src/features/<slice>/`, not by technical layer.

- Each slice publishes its surface from `src/features/<slice>/index.ts`. That
  file is the slice's contract with the rest of the app.
- Cross-slice imports go through the exporting slice's `index.js` and nothing
  else. Everything under `src/features/<slice>/internal/` is private to that
  slice — row mappers, SQL, shapes that exist to serve the slice's own
  implementation. g2 depends on that privacy holding.
- A slice may import freely within its own directory.

## Questions

(none)

## Risks

- `index.ts` grows into a wide surface over time. Accepted — a wide but
  explicit contract still beats reaching into internals.
