---
slug: usage-rollup
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-07-10
---

## Checklist

- [x] T-01 [g1] — add the billing-period event count
- [x] T-02 [g1] — include the period count in the account summary

## Tasks

### T-01 — add the billing-period event count

**Deps:** (none)
**Files:** src/usage/rollup.ts

Count events falling in the half-open window (D-01).

### T-02 — include the period count in the account summary

**Deps:** T-01
**Files:** src/accounts/summary.ts

Narrow the events to the account with `eventsForAccount`, count them with
`countInPeriod`, and return the total as `eventsThisPeriod` (D-02).
