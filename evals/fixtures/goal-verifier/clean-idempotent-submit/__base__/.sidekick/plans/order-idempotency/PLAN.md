---
slug: order-idempotency
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-07-08
---

## Checklist

- [x] T-01 [g1] — add the idempotency key store
- [x] T-02 [g1] — dedupe on submit through the key store

## Tasks

### T-01 — add the idempotency key store

**Deps:** (none)
**Files:** src/orders/idempotency.ts

`lookup` and `remember` over an in-memory map, dropping entries older than the
24h TTL (D-01).

### T-02 — dedupe on submit through the key store

**Deps:** T-01
**Files:** src/orders/submit.ts

Look the key up before doing work and return the stored result on a hit (D-02);
on a miss, do the work and remember the result.
