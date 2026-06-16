---
slug: rfc-intra-section
created: 2026-06-16
status: draft
---

## Goals & non-goals

- g1: ingest upstream inventory changes reliably.

## Architecture

An ingestion worker consumes upstream changes and writes them to the local store.

## Decisions

- D-01: ingest via webhooks the upstream pushes to our endpoint.
- D-03: the worker polls the upstream API on a 30s timer to pull changes.

## Questions

- What is the upstream's rate limit?

## Risks

- Duplicate events on redelivery.
