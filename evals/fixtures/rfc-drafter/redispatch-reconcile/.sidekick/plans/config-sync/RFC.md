---
slug: config-sync
created: 2026-06-16
status: draft
---

# Config sync to edge nodes

## Goals & non-goals

- g_1: propagate config changes to edge nodes within one second
- g_2: survive an edge node reconnecting after downtime

### Non-goals
- Not addressing config schema migration.

## Architecture

### Recommendation
Long-poll the config service from each edge node. Forced by: simplicity — no inbound endpoint.

### Alternatives considered
- Webhook push — rejected because it adds an inbound endpoint to maintain.

### Structured return
- Recommendation: long-poll
- Confidence: medium
- Off-stack rejection: (none)

## Decisions

D-01: Use webhook push for config propagation — chosen for sub-second latency.

## Questions

(none surfaced during design)

## Risks

(none surfaced during design)
