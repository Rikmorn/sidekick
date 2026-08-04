---
slug: catalogue-filters
created: 2026-07-14
status: locked
---

## Goals & non-goals

- g1: a catalogue search restricted to a category returns only the items in
  that category — items outside it are dropped before results are returned.
- Non-goal: multi-select category filters (one category per search for now).

## Architecture

`filterByCategory` lives beside the existing text search in `src/catalogue/`.
`searchCatalogue` applies the text match first, then narrows the matched list by
category when the caller supplies one, so the filter stays a pure function over
an already-matched list.

## Decisions

- D-01: category matching is exact on `Item.category`, not prefix or fuzzy.
- D-02: an absent or empty category means "no narrowing" — the text-match result
  passes through unchanged.

## Risks

- An empty category string must mean "no filter", not "match nothing".
