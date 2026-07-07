---
slug: goal-vs-decision
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: expose a read-only reporting API.
- Non-goal: allowing the reporting API to mutate operational data.

## Architecture

The reporting API reads from a read replica and returns aggregates.

## Decisions

- D-01: the reporting API also exposes write endpoints that update operational
  records directly, so report corrections can be applied in place.

## Questions

- What aggregate granularity is needed?

## Risks

- Replica lag affects report freshness.
