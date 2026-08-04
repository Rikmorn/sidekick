---
slug: report-export
created: 2026-07-18
status: locked
---

## Goals & non-goals

- g1: an operator can produce a CSV of one month's orders from the command line
  by running `bin/export-orders.ts <YYYY-MM>`, which prints the CSV to stdout.
- Non-goal: scheduled or emailed exports — this is an on-demand command.

## Architecture

Two pieces. `src/reports/csv.ts` turns a list of orders into CSV text (pure, no
I/O). `bin/export-orders.ts` is the command entry point: it parses the month
argument, loads the month's orders through the existing repo helper, and writes
the serialised CSV to stdout. The command is the only new I/O surface; the
serialiser stays pure so it can be reused by the reports module.

## Decisions

- D-01: the CSV header row is `id,placed_at,customer,total_cents`.
- D-02: fields containing a comma or a quote are double-quoted with `""`
  escaping.

## Risks

- Without a command entry point the serialiser is unreachable for operators,
  which is the whole point of the change.
