---
slug: csv-export
pins-rfc: 284984bd1e8fd510add3a88c547ad344faa72b96262c948e20bd02e7fdb7ef30
created: 2026-08-04
---

## Checklist

- [ ] T-01 [g1] — stream rows through an async generator
- [ ] T-02 [g3] — add the row-count footer

## Tasks

### T-01 [g1] — stream rows through an async generator

**Deps:** (none)
**Files:** src/export/stream.ts

Implement per the RFC.

### T-02 [g3] — add the row-count footer

**Deps:** T-01
**Files:** src/export/footer.ts

Implement per the RFC.

