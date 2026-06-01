---
slug: refund-window
pins-rfc: 0000000000000000
created: 2026-05-29
---

# PLAN — Refund window helper

## Checklist

- [ ] T-01 Add isWithinRefundWindow to src/refund.ts
- [ ] T-02 Cover the in-window and out-of-window cases with tests
- [ ] T-03 Cover the exact-boundary case

## Tasks

### T-01: Add isWithinRefundWindow to src/refund.ts
**Goals:** g1
Implement the pure function.

### T-02: Cover the in-window and out-of-window cases with tests
**Goals:** g1
Add vitest cases.

### T-03: Cover the exact-boundary case
**Goals:** g2
Add a boundary test (30 days + 1s → false).
