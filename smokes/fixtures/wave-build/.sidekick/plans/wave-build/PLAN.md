---
slug: wave-build
pins-rfc: 0000000000000000
created: 2026-05-29
---

# PLAN — Wave-build demo

## Checklist

- [ ] T-01 Scaffold foo module
- [ ] T-02 Scaffold bar module
- [ ] T-03 Scaffold baz module
- [ ] T-04 Scaffold qux module
- [ ] T-05 Add util export to foo module

## Tasks

### T-01: Scaffold foo module
**Goals:** g1
Root module. No dependencies.
**Deps:**
**Files:**
- Create: `src/foo.ts`

### T-02: Scaffold bar module
**Goals:** g2
Depends on foo. Disjoint files from T-03 — the two land in the same wave.
**Deps:** T-01
**Files:**
- Create: `src/bar.ts`

### T-03: Scaffold baz module
**Goals:** g2
Depends on foo. Disjoint files from T-02 — the two land in the same wave.
**Deps:** T-01
**Files:**
- Create: `src/baz.ts`

### T-04: Scaffold qux module
**Goals:** g1, g2
Depends on both bar and baz — lands in its own later wave.
**Deps:** T-02, T-03
**Files:**
- Create: `src/qux.ts`

### T-05: Add util export to foo module
**Goals:** g1
No declared dependency on T-01 but touches the same file (src/foo.ts).
Wave-plan serializes T-05 after T-01 via file-overlap and emits a warning.
**Deps:**
**Files:**
- Modify: `src/foo.ts`
