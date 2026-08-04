---
slug: helper-imports-entrypoint
created: 2026-08-03
status: locked
---

# Timesheet report command

Add a `report` subcommand that summarises logged hours.

## Goals & non-goals

- **g1:** `timesheet report --week 2026-W31` prints a per-project summary.
- **g2:** Every helper is unit-testable by calling it with plain arguments —
  no process, no argv, no environment.

Non-goals: output formats beyond plain text; time-zone handling.

## Decisions

- **D-01:** Rounding to the nearest quarter-hour happens once, in the
  formatter, so totals and line items never disagree.

## Architecture

`src/cli.ts` is the single entry point. It parses argv, reads the environment,
resolves configuration, and composes helpers into a run.

Helpers under `src/helpers/` are pure library code. Each one receives
everything it needs as arguments and returns a value — no configuration
lookups, no process access, and no import of `src/cli.ts`. The dependency
arrow points one way, from the entry point into the helpers; a helper that
reaches back up to the entry point is what makes g2 impossible.

## Questions

(none)

## Risks

- Argument lists get long as helpers gain options. Accepted — passing a small
  options object is the escape hatch, not a config import.
