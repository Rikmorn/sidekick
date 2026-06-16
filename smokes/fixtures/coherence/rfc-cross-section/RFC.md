---
slug: rfc-cross-section
created: 2026-06-16
status: draft
---

## Goals & non-goals

- g1: deliver order updates to subscribers in near-real-time.
- Non-goal: building a general-purpose event bus.

## Architecture

A background poller runs every 60 seconds, queries the orders table for rows
changed since the last tick, and pushes them to subscribers. The poll interval
is the single tuning knob.

## Decisions

- D-01: deliver updates over webhooks registered per subscriber.
- D-02: chose webhooks over polling — polling was rejected because its 60s
  worst-case latency fails the near-real-time goal.

## Questions

- How do we handle webhook delivery retries?

## Risks

- Subscriber endpoints may be slow or unavailable.
