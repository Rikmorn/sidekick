---
slug: circular-import
created: 2026-07-31
status: locked
---

# Delivery-delay notifications

Tell customers when an order's delivery estimate slips.

## Goals & non-goals

- **g1:** A customer gets one notification per delayed order.
- **g2:** Notification content can change without touching order logic.

Non-goals: notification channels beyond email; user preferences.

## Decisions

- **D-01:** Notifications carry a snapshot of the order fields they render, so
  a late send never re-reads a mutated order.

## Architecture

The service modules under `src/services/` form a directed **acyclic** graph.
The one declared edge is:

`order-service` → `notification-service`

`order-service` may call into `notification-service`. The reverse edge is not
allowed: `notification-service` never imports `order-service`, and no service
module imports a module that (transitively) imports it back.

When the notification side needs something from the order side, the order side
publishes it — `src/events/bus.ts` carries payloads downward, and
`notification-service` subscribes there. That bus is what keeps the graph
acyclic while still letting information travel both ways at runtime.

## Questions

(none)

## Risks

- The event payload duplicates order fields. Accepted per D-01 — the snapshot
  is the point.
