---
slug: webhook-retries
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-07-12
---

## Checklist

- [x] T-01 [g1] — add the exponential backoff schedule
- [x] T-02 [g1,g2] — add the retry decision and the delivery loop
- [x] T-03 [g1,g2] — dispatch through the retry loop

## Tasks

### T-01 — add the exponential backoff schedule

**Deps:** (none)
**Files:** src/webhooks/backoff.ts

Doubling from 500ms, capped at 30s (D-01).

### T-02 — add the retry decision and the delivery loop

**Deps:** T-01
**Files:** src/webhooks/retry.ts

`shouldRetry` per D-02, plus a loop over `deliverOnce` that waits
`backoffMs(attempt)` between retryable failures and returns as soon as the
status is not retryable.

### T-03 — dispatch through the retry loop

**Deps:** T-02
**Files:** src/webhooks/index.ts

Point `dispatchWebhook` at the loop so every dispatched delivery is retried.
