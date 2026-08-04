---
slug: signup-validation
created: 2026-07-24
status: locked
---

## Goals & non-goals

- g1: a signup with an email that already has an account is rejected — no second
  account row is created for that address.
- g2: a signup whose password fails the strength policy is rejected, with the
  policy decision made from the submitted password.
- Non-goal: email-address verification (a separate flow owns confirmation).

## Architecture

Two pure checks feeding one composition point. `isDuplicateEmail` asks the
account store whether the normalised address already exists; `meetsPolicy`
decides whether a candidate password satisfies the strength rules. `signup`
runs both before it inserts, and returns the first failure it finds.

## Decisions

- D-01: email comparison is case-insensitive on the trimmed address.
- D-02: the strength policy is length >= 12 plus at least one digit and one
  non-alphanumeric character.

## Risks

- A policy check that accepts everything is invisible from the call site, since
  the wiring looks identical either way.
