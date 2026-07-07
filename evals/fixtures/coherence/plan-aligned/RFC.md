---
slug: plan-aligned
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: add idempotent order submission.

## Architecture

Each order submission carries a client-supplied idempotency key; the server
stores the key with the result and returns the stored result on any replay.

## Decisions

- D-01: dedupe submissions by a client-supplied idempotency key.
- D-02: persist idempotency keys for 24 hours.

## Questions

- What key format do clients generate?

## Risks

- Key storage growth under high volume.
