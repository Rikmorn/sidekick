---
slug: cross-section-storage
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: persist user sessions so they survive a node restart.

## Architecture

Sessions are held in each node's local process memory for fastest access.

## Decisions

- D-01: store sessions in a shared Redis instance so any node can serve any
  request and sessions survive a single node restart.

## Questions

- What session TTL is appropriate?

## Risks

- Redis is a shared dependency.
