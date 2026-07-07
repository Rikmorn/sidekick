---
slug: cross-section-poller
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: notify subscribers of ticket status changes quickly.

## Architecture

A background poller queries the tickets table every 5 minutes and emails
subscribers about any rows that changed since the last run.

## Decisions

- D-01: push status changes to subscribers over webhooks the moment they occur.
- D-02: rejected polling — its multi-minute latency fails the "quickly" goal.

## Questions

- What webhook retry policy applies?

## Risks

- Subscriber endpoints may be down.
