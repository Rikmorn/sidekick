---
slug: clean-rate-limiter
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: cap each tenant's request rate to protect shared capacity.
- Non-goal: cross-tenant fairness scheduling.

## Architecture

A token-bucket limiter sits in the API gateway. Each tenant has a bucket
refilled at a fixed rate; a request that finds an empty bucket is rejected with
HTTP 429. Buckets live in the gateway process memory.

## Decisions

- D-01: enforce limits with a per-tenant token bucket in the gateway.
- D-02: reject over-limit requests with HTTP 429 rather than queueing them.

## Questions

- What refill-rate defaults are sane per plan tier?

## Risks

- A gateway restart resets buckets, briefly allowing a burst.
