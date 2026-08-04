---
slug: webhook-retries
created: 2026-07-12
status: locked
---

## Goals & non-goals

- g1: a webhook delivery that fails with a 5xx status is retried, and the wait
  between attempts grows exponentially.
- g2: a webhook delivery that fails with a 4xx status is not retried — it
  returns after the first attempt.
- Non-goal: a dead-letter queue for deliveries that exhaust their attempts.

## Architecture

Three small pieces behind the existing dispatch entry point. `backoffMs` maps a
1-based attempt number to a delay. `shouldRetry` classifies a response status.
`deliverWithRetries` is the loop: it calls the existing single-attempt
`deliverOnce`, stops as soon as the status is not retryable, and otherwise waits
`backoffMs(attempt)` before trying again. `dispatchWebhook` calls the loop
instead of the single attempt.

## Decisions

- D-01: backoff doubles from 500ms and is capped at 30s.
- D-02: only 5xx is treated as transient; 4xx is the caller's fault and is
  returned immediately.

## Risks

- Five attempts against a hard-down endpoint holds a worker for roughly a
  minute; acceptable while the worker pool is generous.
