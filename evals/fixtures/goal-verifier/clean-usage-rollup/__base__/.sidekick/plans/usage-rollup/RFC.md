---
slug: usage-rollup
created: 2026-07-10
status: locked
---

## Goals & non-goals

- g1: the account summary reports how many usage events the account recorded in
  the current billing period, counted from the stored events rather than a
  cached figure.
- Non-goal: per-event-kind breakdowns — one total is enough for now.

## Architecture

`countInPeriod` in `src/usage/rollup.ts` is a pure count over a list of events
and a period window. `accountSummary` composes it with the existing
`eventsForAccount` helper, so the number in the summary is derived from the same
event list the rest of the system reads.

## Decisions

- D-01: the period window is half-open — `start` inclusive, `end` exclusive — so
  adjacent periods cannot double-count an event.
- D-02: the summary derives the count on read; nothing is cached.

## Risks

- Counting over a large event list on every summary read is acceptable at
  current volumes and can be indexed later.
