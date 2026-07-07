---
status: accepted
date: 2026-06-20
---

## Context

We need a retention policy for application logs.

## Decision

Retain application logs for 90 days, then purge them automatically.

## Drivers

- Balance debuggability against storage cost and privacy exposure.

## Consequences

- Logs older than 90 days are unavailable for investigations; storage stays
  bounded and old personal data is not retained indefinitely.
