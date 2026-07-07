---
status: accepted
date: 2026-06-20
---

## Context

We must decide how to store feature-flag state for the web app.

## Decision

Store all feature-flag state in the client's localStorage; the server never
holds flag state.

## Drivers

- Instant flag reads with no network round trip.

## Consequences

- An operator can flip a flag centrally and every user sees the change on their
  next request, because the server is the single source of truth for flags.
