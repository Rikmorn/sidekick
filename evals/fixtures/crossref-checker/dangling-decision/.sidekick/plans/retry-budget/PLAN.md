---
slug: retry-budget
pins-rfc: 370b9cde1519f5afd616c193634b5b99e0d540543f9f67a94ef4c45d9554287a
created: 2026-08-04
---

## Checklist

- [ ] T-01 [g1] — wrap outbound calls in the budgeted retry helper
- [ ] T-02 [D-03] — expose the budget in config

## Tasks

### T-01 [g1] — wrap outbound calls in the budgeted retry helper

**Deps:** (none)
**Files:** src/net/retry.ts

Implement per the RFC.

### T-02 [D-03] — expose the budget in config

**Deps:** T-01
**Files:** src/net/config.ts

Implement per the RFC.

