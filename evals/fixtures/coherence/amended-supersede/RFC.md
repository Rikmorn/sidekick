---
slug: amended-supersede
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: deliver search-index updates within seconds of a write.

## Architecture

On each write, the indexer publishes the changed document to a message broker;
index workers consume and apply updates. Delivery is push-based, not polled.

## Decisions

- D-01: rebuild the whole index nightly on a cron schedule.

## Questions

- What is the peak write rate the broker must absorb?

## Risks

- Broker backlog under write spikes.

## Amendments

- A-01: supersede D-01 — replace the nightly full rebuild with per-write broker
  push. The nightly rebuild missed the within-seconds goal; incremental push
  replaces it and is exactly what the Architecture describes.
