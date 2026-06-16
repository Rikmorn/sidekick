---
slug: rfc-amended
created: 2026-06-16
status: draft
---

## Goals & non-goals

- g1: deliver order updates to subscribers in near-real-time.

## Architecture

Each subscriber registers a webhook URL; the dispatcher posts updates to it
with retry and backoff.

## Decisions

- D-02: deliver updates by polling the orders table every 60s.

## Questions

- What backoff schedule for failed deliveries?

## Risks

- Subscriber endpoints may be slow or unavailable.

## Amendments

- A-01: supersede D-02 — switch from polling to per-subscriber webhooks. The
  60s polling latency failed the near-real-time goal; webhooks replace it.
