---
slug: import-dedupe
status: locked
---

# RFC — Import de-duplication

## Summary

Small change described for the import-dedupe fixture.

## Goals & non-goals

- g1 — the export command streams rows without buffering the full set
- g2 — malformed rows are skipped with a counted warning, never a crash
- g3 — imports are idempotent across re-runs

Non-goals: rewriting the surrounding module; changing the public API.

## Decisions

- D-01 — stream via an async generator, not an accumulating array
- D-02 — warnings aggregate into one summary line at the end
- D-03 — dedupe key is the normalised source id
