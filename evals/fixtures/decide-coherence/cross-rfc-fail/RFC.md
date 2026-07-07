---
slug: payment-retry
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: make payment submission safely retryable.

## Architecture

Clients attach an idempotency key to each payment attempt; the gateway dedupes
by that key before forwarding to the provider.

## Decisions

- D-01: use a client-generated UUID as the idempotency key, scoped to the
  payment provider API call. Keys expire after 24 hours server-side.

## Questions

- What key TTL balances safety and storage?

## Risks

- Clients that reuse a UUID across distinct payments.
