---
slug: catalogue-filters
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-07-14
---

## Checklist

- [x] T-01 [g1] — add `filterByCategory` to the catalogue module
- [x] T-02 [g1] — narrow `searchCatalogue` results by category

## Tasks

### T-01 — add `filterByCategory` to the catalogue module

**Deps:** (none)
**Files:** src/catalogue/filter.ts

Exact-match `Item.category` against the requested category; an empty or absent
category returns the input list unchanged (D-01, D-02).

### T-02 — narrow `searchCatalogue` results by category

**Deps:** T-01
**Files:** src/catalogue/search.ts

Apply the text match first, then pass the matched list through
`filterByCategory` when the caller supplies a category.
