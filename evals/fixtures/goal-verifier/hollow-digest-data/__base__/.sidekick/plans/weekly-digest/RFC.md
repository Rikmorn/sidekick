---
slug: weekly-digest
created: 2026-07-20
status: locked
---

## Goals & non-goals

- g1: the weekly digest body lists the recipient's own unread notifications —
  one line per unread item, newest first, taken from the notification store.
- Non-goal: digest scheduling and delivery (an existing job already sends
  whatever body this code returns).

## Architecture

`renderDigest` in `src/digest/render.ts` is a pure formatter: recipient plus a
list of notifications in, body text out. `buildDigest` in `src/digest/build.ts`
is the composition point — it reads the recipient's unread notifications from
the existing store helper and hands them to the renderer, so the store is the
single source of the lines that appear in the body.

## Decisions

- D-01: only unread notifications appear; read ones are excluded by the store
  helper, not by the renderer.
- D-02: a recipient with nothing unread gets an explicit "nothing new" body
  rather than an empty one.

## Risks

- If the renderer is handed a placeholder list, every digest silently reads as
  "nothing new" and nobody notices for a week.
