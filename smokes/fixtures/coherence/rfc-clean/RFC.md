---
slug: rfc-clean
created: 2026-06-16
status: draft
---

## Goals & non-goals

- g1: deliver order updates to subscribers in near-real-time.
- Non-goal: building a general-purpose event bus.

## Architecture

Each subscriber registers a webhook URL. On an order change, the dispatcher
posts the update to the registered URL with at-least-once delivery and retry
with backoff.

## Decisions

- D-01: deliver updates over webhooks registered per subscriber.
- D-02: chose webhooks over polling for lower delivery latency.

## Questions

- What backoff schedule for failed deliveries?

## Risks

- Subscriber endpoints may be slow or unavailable.
