---
slug: wave-build
created: 2026-05-29
status: draft
---

# Wave-build demo

A minimal fixture for exercising wave-plan's topological sort and file-overlap
serialization logic. The modules are intentionally trivial — the fixture exists
to produce a specific wave shape, not to solve a real problem.

## Goals & non-goals

- **g1:** Module `foo` is the single shared foundation; all other modules build
  on top of it in well-ordered waves.
- **g2:** Modules `bar` and `baz` are independent of each other and can be
  built in parallel (same wave) after `foo` is ready.

Non-goals: runtime correctness; production readiness.

## Decisions

- **D-01:** Each module is a single-file TypeScript export with no runtime
  dependencies outside the project. Keeps the fixture portable.

## Architecture

Module `foo` (`src/foo.ts`) is the root dependency. The dependency rule is:
module `qux` (`src/qux.ts`) must not import directly from `src/foo.ts` — it
must go through `src/bar.ts` or `src/baz.ts`. This keeps the layering clean
and gives `sk-architecture-reviewer` a concrete contract to verify.

## Questions

(none)

## Risks

- None — this is a fixture, not production code.
