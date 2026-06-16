---
slug: plan-vs-rfc
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-06-16
---

## Checklist

- [ ] T-06 [D-04] — add a process-wide mutable pricing cache singleton

## Tasks

### T-06 — add a process-wide mutable pricing cache singleton

**Deps:** (none)
**Files:** src/pricing/cache.ts

Introduce a module-level mutable cache shared across all requests, populated on
first access and reused for the process lifetime.
