---
slug: plan-realizes-rejected
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: keep per-request pricing views isolated and fresh.

## Architecture

Each request builds its own pricing view from the store; no shared mutable state
between requests.

## Decisions

- D-01: rejected a shared mutable cache — each request builds its own view to
  avoid cross-request staleness.

## Questions

- Is per-request rebuild fast enough?

## Risks

- Rebuild cost per request.
