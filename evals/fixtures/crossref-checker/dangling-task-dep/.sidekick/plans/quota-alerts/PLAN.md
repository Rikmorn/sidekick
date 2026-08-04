---
slug: quota-alerts
pins-rfc: 60b0e8e28b5d3854c86f594a27ec3ccaf414962f1241d971ce44b12245812c4c
created: 2026-08-04
---

## Checklist

- [ ] T-01 [g1] — compute usage against the quota
- [ ] T-02 [g2] — send the threshold alert

## Tasks

### T-01 [g1] — compute usage against the quota

**Deps:** (none)
**Files:** src/quota/usage.ts

Implement per the RFC.

### T-02 [g2] — send the threshold alert

**Deps:** T-99
**Files:** src/quota/alert.ts

Implement per the RFC.

