---
slug: clean-cache-ttl
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: cut profile read latency with a short-lived cache.
- Non-goal: strong read-after-write consistency across nodes.

## Architecture

Each node keeps an in-process LRU cache of user profiles with a 60-second TTL.
On a miss the node reads the store and populates its own cache. Writes
invalidate only the local entry; staleness up to the TTL is accepted.

## Decisions

- D-01: cache profiles in-process per node with a 60s TTL.
- D-02: accept up to 60s of cross-node staleness (no shared invalidation).

## Questions

- Is 60s the right TTL for the profile change rate?

## Risks

- A node serving a just-updated profile may return stale data for up to 60s.
