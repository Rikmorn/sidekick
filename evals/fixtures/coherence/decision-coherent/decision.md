---
status: accepted
date: 2026-06-20
---

## Context

We must pick where to run scheduled background jobs for a multi-node service.

## Decision

Run scheduled jobs on a single elected leader node, chosen with a distributed
lock; only the lock holder runs jobs.

## Drivers

- Avoid duplicate job runs across nodes.
- Keep scheduling simple and observable.

## Consequences

- Exactly one node runs a given job at a time; if the leader dies, the lock
  expires and another node takes over.
