---
status: accepted
date: 2026-06-20
---

## Context

We need a format for inter-service messages on the internal bus.

## Decision

Encode messages as JSON with a required "schema_version" field on every message.

## Drivers

- Human-readable payloads for debugging.
- Ability to evolve message shapes over time.

## Consequences

- Consumers branch on schema_version to handle old and new shapes during a
  rollout, and payloads are inspectable without special tooling.
