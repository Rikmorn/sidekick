---
slug: plan-vs-rfc
created: 2026-06-16
status: draft
---

## Goals & non-goals

- g1: serve each request a consistent view of pricing.

## Architecture

Each request constructs its own pricing view from the store; no shared mutable
state between requests.

## Decisions

- D-04: rejected a shared mutable cache — each request builds its own view to
  avoid cross-request staleness.

## Questions

- Is per-request rebuild fast enough under load?

## Risks

- Rebuild cost per request.
