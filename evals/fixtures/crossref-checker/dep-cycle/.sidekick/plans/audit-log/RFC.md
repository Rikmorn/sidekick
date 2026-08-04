---
slug: audit-log
status: locked
---

# RFC — Audit log rotation

## Summary

Small change described for the audit-log fixture.

## Goals & non-goals

- g1 — the export command streams rows without buffering the full set
- g2 — malformed rows are skipped with a counted warning, never a crash

Non-goals: rewriting the surrounding module; changing the public API.

## Decisions

- D-01 — stream via an async generator, not an accumulating array
- D-02 — warnings aggregate into one summary line at the end
