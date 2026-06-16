---
status: accepted
date: 2026-06-16
---

## Context

We need to store user session state for a horizontally-scaled service.

## Decision

Store sessions in-memory, local to each node.

## Drivers

- Lowest possible read latency.
- No external dependency.

## Consequences

- Sessions survive a node restart and are shared across all nodes in the
  cluster, so any node can serve any request.
