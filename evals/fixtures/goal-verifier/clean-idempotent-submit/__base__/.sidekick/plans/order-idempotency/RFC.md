---
slug: order-idempotency
created: 2026-07-08
status: locked
---

## Goals & non-goals

- g1: submitting the same order twice with the same idempotency key stores one
  order and returns the first result for the repeat submission.
- Non-goal: cross-process key storage — a single-process store is enough while
  submissions are handled by one worker.

## Architecture

`src/orders/idempotency.ts` owns a key store with two operations: `lookup` a
key (honouring a TTL) and `remember` a key with the result it produced.
`submitOrder` consults the store before doing any work and records the result
afterwards, so the store is the only place dedupe state lives.

## Decisions

- D-01: keys expire 24 hours after they were recorded.
- D-02: a repeat submission returns the stored result rather than an error, so
  clients retrying a timed-out request see success.

## Risks

- An expired key lets a genuine duplicate through; 24h is chosen to comfortably
  outlast client retry windows.
