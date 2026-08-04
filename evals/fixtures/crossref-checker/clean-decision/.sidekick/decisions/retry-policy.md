# Retry policy: budgeted exponential backoff

**Status:** decided 2026-08-04

## Context

Settled while reviewing [the retry RFC](../plans/retry-budget/RFC.md).

## Decision

Outbound calls retry on 5xx with exponential backoff inside a per-request budget.
