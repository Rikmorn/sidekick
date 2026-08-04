---
slug: audit-log
pins-rfc: 70a37dea155cd56aba444b1f947b2acdbe42941da90266c446f271778f339e14
created: 2026-08-04
---

## Checklist

- [ ] T-01 [g1] — rotate the audit log daily
- [ ] T-02 [g2] — compress rotated logs

## Tasks

### T-01 [g1] — rotate the audit log daily

**Deps:** T-02
**Files:** src/audit/rotate.ts

Implement per the RFC.

### T-02 [g2] — compress rotated logs

**Deps:** T-01
**Files:** src/audit/compress.ts

Implement per the RFC.

