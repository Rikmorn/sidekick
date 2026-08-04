---
slug: clean-port-adapter
created: 2026-08-02
status: locked
---

# Deterministic token expiry

Make short-lived API token expiry testable without sleeping.

## Goals & non-goals

- **g1:** Token issue and expiry logic is exercised by tests that control time.
- **g2:** Production behaviour is unchanged — real runs still read the wall
  clock.

Non-goals: token revocation; refresh flows.

## Decisions

- **D-01:** Tokens carry an absolute expiry timestamp rather than a duration,
  so a clock swap in tests does not change the stored shape.

## Architecture

Ports and adapters:

- **`src/ports/`** declares the interfaces services depend on (`ClockPort`).
- **`src/adapters/`** holds the concrete implementations. Adding a second
  implementation of an existing port is an adapter-directory change, and an
  adapter may import the port it implements.
- **`src/services/`** holds policy. A service takes its collaborators as
  constructor arguments typed as ports; it imports from `src/ports/` and not
  from `src/adapters/`.
- **`src/main.ts`** is the composition root — the one module that constructs
  adapters and injects them into services.

## Questions

(none)

## Risks

- A test clock in the shipped bundle is dead weight in production. Accepted —
  it is a handful of lines and keeps the wiring uniform.
