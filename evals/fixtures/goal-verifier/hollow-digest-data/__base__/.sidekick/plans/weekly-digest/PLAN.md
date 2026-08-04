---
slug: weekly-digest
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-07-20
---

## Checklist

- [x] T-01 [g1] — add the digest renderer
- [x] T-02 [g1] — build the digest from the recipient's unread notifications

## Tasks

### T-01 — add the digest renderer

**Deps:** (none)
**Files:** src/digest/render.ts

One line per notification, newest first, with the "nothing new" body for an
empty list (D-02).

### T-02 — build the digest from the recipient's unread notifications

**Deps:** T-01
**Files:** src/digest/build.ts

Read the recipient's unread notifications through `listUnread` and pass them to
the renderer, so the body reflects that recipient's real unread items (D-01).
