---
slug: refund-window
created: 2026-05-29
status: draft
---

# Refund window helper

## Goals & non-goals

- **g1:** `isWithinRefundWindow(orderDate, now)` returns true iff `now` is within 30 days of `orderDate`.
- **g2:** Dates outside the window (including exactly 30 days + 1 second) return false.

Non-goals: timezone handling; partial refunds.

## Architecture

A single pure function in `src/refund.ts`, unit-tested. No I/O.

## Decisions

- D-01: 30-day window measured in milliseconds against UTC timestamps.

## Questions

(none)

## Risks

- Off-by-one at the exact boundary — covered by g2.
