---
slug: webhook-sign
pins-rfc: a6e7bdbe5470399c23e9844d93d9bd26911f9f4f23ac7358f7f5c75b09db2ae5
created: 2026-08-04
---

## Checklist

- [ ] T-01 [g1, D-01] — verify inbound signatures
- [ ] T-02 [g2, D-02] — count and summarise rejects

## Tasks

### T-01 [g1, D-01] — verify inbound signatures

**Deps:** (none)
**Files:** src/webhooks/verify.ts

Implement per the RFC.

### T-02 [g2, D-02] — count and summarise rejects

**Deps:** T-01
**Files:** src/webhooks/rejects.ts

Implement per the RFC.

