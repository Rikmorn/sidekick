---
slug: plan-aligned
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-06-20
---

## Checklist

- [ ] T-01 [D-01] — extract the client idempotency key and dedupe on submit
- [ ] T-02 [D-02] — persist keys with a 24h TTL

## Tasks

### T-01 — extract the client idempotency key and dedupe on submit

**Deps:** (none)
**Files:** src/orders/idempotency.ts

Read the client-supplied idempotency key on submit; if it has been seen, return
the stored result instead of re-processing.

### T-02 — persist keys with a 24h TTL

**Deps:** T-01
**Files:** src/orders/idempotency-store.ts

Store each key and its result with a 24-hour expiry.
