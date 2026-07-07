---
status: accepted
date: 2026-06-20
---

## Context

We are choosing the idempotency-key strategy for payment retries, deriving from
the payment-retry RFC.

## Decision

Use a server-generated sequence number as the idempotency key, issued at request
ingestion. The client does not generate or supply the key.

## Drivers

- Guaranteed uniqueness without trusting client input.

## Consequences

- The server assigns and owns every idempotency key for its lifetime.
